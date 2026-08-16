from __future__ import annotations

import logging
import re
from collections import deque
from datetime import UTC, datetime
from itertools import count
from threading import Lock

from sqlalchemy import select

from app.database import SessionLocal
from app.instance_status.models import InstanceLog
from app.instance_status.settings import get_log_retention_days, purge_expired_logs


MAX_LOG_ENTRIES = 2_000
MAX_LOG_MESSAGE_LENGTH = 4_000
_entries: deque[dict[str, str | int]] = deque(maxlen=MAX_LOG_ENTRIES)
_entries_lock = Lock()
_entry_ids = count(1)
_installed = False

_SECRET_PATTERNS = (
    re.compile(r"(?i)(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+"),
    re.compile(r"(?i)((?:password|passwd|secret|token|api[_-]?key|encryption[_-]?key)\s*[:=]\s*)[^\s,;&]+"),
    re.compile(r"(?i)([?&](?:token|key|signature|x-amz-signature)=)[^&\s]+"),
)
_EMAIL_PATTERN = re.compile(r"(?i)\b([a-z0-9._%+-])[a-z0-9._%+-]*@([a-z0-9.-]+\.[a-z]{2,})\b")


def sanitize_log_text(value: str) -> str:
    """Redact secrets and minimize e-mail addresses before retaining log text."""

    sanitized = value.replace("\r", " ").replace("\n", " ")
    for pattern in _SECRET_PATTERNS:
        sanitized = pattern.sub(r"\1[REDACTED]", sanitized)
    sanitized = _EMAIL_PATTERN.sub(r"\1***@\2", sanitized)
    return sanitized[:MAX_LOG_MESSAGE_LENGTH]


def component_for_logger(name: str) -> str:
    normalized = name.lower()
    for marker, component in (
        ("auth", "AUTH"), ("database", "DATABASE"), ("sqlalchemy", "DATABASE"),
        ("photo", "MEDIA"), ("media", "MEDIA"), ("routing", "ROUTING"),
        ("email", "EMAIL"), ("import", "IMPORT"), ("export", "EXPORT"),
        ("admin", "ADMIN"), ("task", "WORKER"),
    ):
        if marker in normalized:
            return component
    return "API"


class InstanceLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        # Access logging runs on Uvicorn's event-loop thread after a response.
        # Persisting it would request another database connection while the
        # request dependency may still own one. At pool capacity that creates
        # a circular wait and can make the whole API unresponsive. Access logs
        # are also high-volume and provide little value in the admin history.
        if record.name == "uvicorn.access":
            return
        try:
            message = sanitize_log_text(record.getMessage())
            if record.exc_info:
                exception = self.formatter.formatException(record.exc_info) if self.formatter else logging.Formatter().formatException(record.exc_info)
                message = sanitize_log_text(f"{message} · {exception}")
            entry = {
                "id": next(_entry_ids),
                "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
                "level": record.levelname if record.levelname in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO",
                "component": component_for_logger(record.name),
                "logger": record.name[:160],
                "message": message,
            }
            with _entries_lock:
                _entries.append(entry)
            _persist_entry(entry)
        except Exception:
            self.handleError(record)


def record_instance_log(level: int, logger_name: str, message: str) -> None:
    """Store a trusted internal event even when the hosting server owns logging."""

    record = logging.LogRecord(logger_name, level, __file__, 0, message, (), None)
    InstanceLogHandler().emit(record)


def _persist_entry(entry: dict[str, str | int]) -> None:
    """Persist without allowing a logging failure to affect the application."""

    session = SessionLocal()
    try:
        session.add(InstanceLog(
            timestamp=datetime.fromisoformat(str(entry["timestamp"])).replace(tzinfo=None),
            level=str(entry["level"]), component=str(entry["component"]),
            logger=str(entry["logger"]), message=str(entry["message"]),
        ))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


def install_instance_log_handler() -> None:
    global _installed
    root_logger = logging.getLogger()
    handler = next(
        (item for item in root_logger.handlers if isinstance(item, InstanceLogHandler)),
        None,
    )
    if handler is None:
        handler = InstanceLogHandler(level=logging.DEBUG)
        root_logger.addHandler(handler)
    # Uvicorn owns a separate non-propagating error logger in production.
    # Access records are intentionally excluded in InstanceLogHandler.emit.
    for logger_name in ("uvicorn.error",):
        service_logger = logging.getLogger(logger_name)
        # Development configurations commonly propagate these loggers to the
        # root logger. In that case the root handler is sufficient and adding
        # it again would duplicate every entry in the administration panel.
        if service_logger.propagate:
            continue
        if not any(isinstance(item, InstanceLogHandler) for item in service_logger.handlers):
            service_logger.addHandler(handler)
    _installed = True


def query_logs(
    *, level: str | None = None, component: str | None = None, search: str | None = None,
    limit: int = 100, before: int | None = None, order: str = "newest",
) -> tuple[list[dict[str, str | int]], bool, int | None]:
    session = SessionLocal()
    try:
        retention_days = get_log_retention_days(session)
        purge_expired_logs(session, retention_days)
        statement = select(InstanceLog)
        if before is not None:
            statement = statement.where(InstanceLog.id < before)
        if level:
            statement = statement.where(InstanceLog.level == level)
        if component:
            statement = statement.where(InstanceLog.component == component)
        if search:
            needle = f"%{search.strip()}%"
            statement = statement.where(InstanceLog.message.ilike(needle) | InstanceLog.logger.ilike(needle))
        statement = statement.order_by(InstanceLog.id.desc() if order == "newest" else InstanceLog.id.asc()).limit(limit + 1)
        rows = session.scalars(statement).all()
        truncated = len(rows) > limit
        rows = rows[:limit]
        items = [{"id": row.id, "timestamp": row.timestamp.isoformat(), "level": row.level, "component": row.component, "logger": row.logger, "message": row.message} for row in rows]
        next_before = rows[-1].id if order == "newest" and truncated and rows else None
        return items, truncated, next_before
    except Exception:
        # During a database migration, keep the administration console useful.
        with _entries_lock:
            fallback = list(_entries)
        fallback.sort(key=lambda item: int(item["id"]), reverse=order == "newest")
        return fallback[:limit], len(fallback) > limit, None
    finally:
        session.close()


def clear_logs_for_tests() -> None:
    with _entries_lock:
        _entries.clear()
    session = SessionLocal()
    try:
        session.query(InstanceLog).delete()
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


install_instance_log_handler()
