from __future__ import annotations

from datetime import UTC, datetime, timedelta
from collections.abc import Callable
import logging

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.exports.temporary_exports import export_root
from app.imports.service import IMPORT_ROOT
from app.tasks.models import BackgroundTask, GeneratedExport, KmzImportPreview

logger = logging.getLogger(__name__)

# A partial export older than this was abandoned by a crashed attempt; the
# recovery path regenerates into a fresh artifact, so it is safe to remove.
_PARTIAL_MAX_AGE = timedelta(hours=1)


def purge_partial_export_artifacts() -> int:
    root = export_root()
    if not root.is_dir():
        return 0
    cutoff = datetime.now(UTC) - _PARTIAL_MAX_AGE
    removed = 0
    for path in root.glob("*.part"):
        try:
            if path.is_file() and datetime.fromtimestamp(path.stat().st_mtime, UTC) < cutoff:
                path.unlink(missing_ok=True)
                removed += 1
        except OSError:
            logger.warning("Unable to remove partial export artifact %s", path, exc_info=True)
    return removed


def purge_expired_task_artifacts(
    session: Session,
    before_commit: Callable[[], None] | None = None,
) -> tuple[int, int]:
    if before_commit is not None:
        before_commit()
    now = datetime.now(UTC)
    exports = session.scalars(select(GeneratedExport).where(GeneratedExport.expires_at <= now)).all()
    previews = session.scalars(select(KmzImportPreview).where(KmzImportPreview.expires_at <= now)).all()
    for item in exports:
        if before_commit is not None:
            before_commit()
        (export_root() / item.storage_name).unlink(missing_ok=True)
    for item in previews:
        if before_commit is not None:
            before_commit()
        (IMPORT_ROOT / item.storage_name).unlink(missing_ok=True)
    if exports:
        session.execute(delete(GeneratedExport).where(GeneratedExport.id.in_([item.id for item in exports])))
    if previews:
        session.execute(delete(KmzImportPreview).where(KmzImportPreview.id.in_([item.id for item in previews])))
    session.execute(update(BackgroundTask).where(
        BackgroundTask.expires_at <= now,
        BackgroundTask.status.in_(("pending", "succeeded", "failed", "cancelled")),
    ).values(status="expired"))
    if before_commit is not None:
        before_commit()
    session.commit()
    if before_commit is not None:
        before_commit()
    purge_partial_export_artifacts()
    return len(exports), len(previews)
