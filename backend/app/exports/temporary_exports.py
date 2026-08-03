from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
from threading import Lock
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.tasks.models import GeneratedExport

EXPORT_TTL = timedelta(minutes=15)
DEFAULT_EXPORT_ROOT = Path(__file__).resolve().parents[2] / "storage" / "exports"
EXPORT_ROOT = Path(os.getenv("EXPORT_STORAGE_PATH", str(DEFAULT_EXPORT_ROOT))).expanduser().resolve()


def export_root() -> Path:
    return EXPORT_ROOT


@dataclass(frozen=True)
class TemporaryExport:
    export_id: UUID
    map_id: UUID
    user_id: UUID
    path: Path
    file_name: str
    expires_at: datetime


_exports: dict[UUID, TemporaryExport] = {}
_lock = Lock()


def create(map_id: UUID, user_id: UUID, file_name: str, session: Session | None = None, *, task_id: UUID | None = None) -> TemporaryExport:
    if session is None:
        purge()
    root = export_root()
    root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file_name).suffix.lower()
    if suffix not in {".gpx", ".kmz", ".pdf"}:
        suffix = ".bin"
    storage_name = f"{uuid4()}{suffix}"
    expires_at = datetime.now(UTC) + EXPORT_TTL
    if session is not None:
        model = GeneratedExport(
            map_id=map_id, user_id=user_id, task_id=task_id,
            storage_name=storage_name, file_name=file_name,
            media_type=_media_type(suffix), expires_at=expires_at,
        )
        session.add(model)
        session.flush()
        return TemporaryExport(model.id, map_id, user_id, root / storage_name, file_name, expires_at)
    item = TemporaryExport(uuid4(), map_id, user_id, root / storage_name, file_name, expires_at)
    with _lock:
        _exports[item.export_id] = item
    return item


def get(export_id: UUID, map_id: UUID, user_id: UUID, session: Session | None = None) -> TemporaryExport | None:
    if session is not None:
        model = session.scalar(select(GeneratedExport).where(
            GeneratedExport.id == export_id,
            GeneratedExport.map_id == map_id,
            GeneratedExport.user_id == user_id,
            GeneratedExport.expires_at > datetime.now(UTC),
        ))
        if model is None:
            return None
        path = export_root() / model.storage_name
        return TemporaryExport(model.id, model.map_id, model.user_id, path, model.file_name, model.expires_at) if path.is_file() else None
    purge()
    with _lock:
        item = _exports.get(export_id)
    return item if item and item.map_id == map_id and item.user_id == user_id and item.path.is_file() else None


def purge() -> None:
    now = datetime.now(UTC)
    with _lock:
        expired = [item for item in _exports.values() if item.expires_at <= now]
        for item in expired:
            item.path.unlink(missing_ok=True)
            _exports.pop(item.export_id, None)


def remove_for_user(user_id: UUID, session: Session | None = None) -> None:
    if session is not None:
        models = session.scalars(select(GeneratedExport).where(GeneratedExport.user_id == user_id)).all()
        for model in models:
            (export_root() / model.storage_name).unlink(missing_ok=True)
        session.execute(delete(GeneratedExport).where(GeneratedExport.user_id == user_id))
        session.commit()
        return
    with _lock:
        owned = [item for item in _exports.values() if item.user_id == user_id]
        for item in owned:
            item.path.unlink(missing_ok=True)
            _exports.pop(item.export_id, None)


def _media_type(suffix: str) -> str:
    return {
        ".pdf": "application/pdf",
        ".gpx": "application/gpx+xml",
        ".kmz": "application/vnd.google-earth.kmz",
    }.get(suffix, "application/octet-stream")
