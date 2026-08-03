from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.exports.temporary_exports import export_root
from app.imports.service import IMPORT_ROOT
from app.tasks.models import BackgroundTask, GeneratedExport, KmzImportPreview


def purge_expired_task_artifacts(session: Session) -> tuple[int, int]:
    now = datetime.now(UTC)
    exports = session.scalars(select(GeneratedExport).where(GeneratedExport.expires_at <= now)).all()
    previews = session.scalars(select(KmzImportPreview).where(KmzImportPreview.expires_at <= now)).all()
    for item in exports:
        (export_root() / item.storage_name).unlink(missing_ok=True)
    for item in previews:
        (IMPORT_ROOT / item.storage_name).unlink(missing_ok=True)
    if exports:
        session.execute(delete(GeneratedExport).where(GeneratedExport.id.in_([item.id for item in exports])))
    if previews:
        session.execute(delete(KmzImportPreview).where(KmzImportPreview.id.in_([item.id for item in previews])))
    session.execute(update(BackgroundTask).where(
        BackgroundTask.expires_at <= now,
        BackgroundTask.status.in_(("pending", "succeeded", "failed", "cancelled")),
    ).values(status="expired"))
    session.commit()
    return len(exports), len(previews)
