from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from uuid import UUID, uuid4

EXPORT_TTL = timedelta(minutes=15)
EXPORT_ROOT = Path(__file__).resolve().parents[2] / "storage" / "exports"


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


def create(map_id: UUID, user_id: UUID, file_name: str) -> TemporaryExport:
    purge()
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    suffix = Path(file_name).suffix.lower()
    if suffix not in {".gpx", ".kmz"}:
        suffix = ".bin"
    item = TemporaryExport(uuid4(), map_id, user_id, EXPORT_ROOT / f"{uuid4()}{suffix}", file_name, datetime.now(UTC) + EXPORT_TTL)
    with _lock:
        _exports[item.export_id] = item
    return item


def get(export_id: UUID, map_id: UUID, user_id: UUID) -> TemporaryExport | None:
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


def remove_for_user(user_id: UUID) -> None:
    with _lock:
        owned = [item for item in _exports.values() if item.user_id == user_id]
        for item in owned:
            item.path.unlink(missing_ok=True)
            _exports.pop(item.export_id, None)
