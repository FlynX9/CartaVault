from __future__ import annotations

import logging
import re
from collections import deque
from datetime import UTC, datetime
from itertools import count
from threading import Lock


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
        except Exception:
            self.handleError(record)


def install_instance_log_handler() -> None:
    global _installed
    root_logger = logging.getLogger()
    if any(isinstance(handler, InstanceLogHandler) for handler in root_logger.handlers):
        _installed = True
        return
    handler = InstanceLogHandler(level=logging.DEBUG)
    root_logger.addHandler(handler)
    _installed = True


def query_logs(
    *, level: str | None = None, component: str | None = None, search: str | None = None,
    limit: int = 100, before: int | None = None, order: str = "newest",
) -> tuple[list[dict[str, str | int]], bool, int | None]:
    with _entries_lock:
        candidates = list(_entries)
    if before is not None:
        candidates = [item for item in candidates if int(item["id"]) < before]
    if level:
        candidates = [item for item in candidates if item["level"] == level]
    if component:
        candidates = [item for item in candidates if item["component"] == component]
    if search:
        needle = search.casefold()
        candidates = [item for item in candidates if needle in str(item["message"]).casefold() or needle in str(item["logger"]).casefold()]
    candidates.sort(key=lambda item: int(item["id"]), reverse=order == "newest")
    truncated = len(candidates) > limit or (len(_entries) == MAX_LOG_ENTRIES)
    items = candidates[:limit]
    next_before = int(items[-1]["id"]) if order == "newest" and len(candidates) > limit and items else None
    return items, truncated, next_before


def clear_logs_for_tests() -> None:
    with _entries_lock:
        _entries.clear()


install_instance_log_handler()
