from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import require_map_role
from app.exports.temporary_exports import EXPORT_TTL, find_task_export
from app.imports.schemas import KmzConfirmRequest
from app.imports.service import cleanup_cached_import_file, confirm_import, get_cached_import, remove_cached_import
from app.tasks.models import BackgroundTask, GeneratedExport
from app.tasks.registry import ProgressCallback, TaskHandlerResult, task_handler
from app.tasks.service import TaskClaim, ensure_task_held
from app.maps.models import MapMembership, PoiMap
from app.trips.models import Trip
from app.trips.pdf_export import create_pdf
from app.trips.permissions import require_trip_viewer
from app.trips.schemas import TripPdfExportOptions
from app.media.optimization import optimize_existing_media  # noqa: F401
from app.trips.service import load_trip
from app.basemaps import vector_generation as _vector_generation  # noqa: F401

logger = logging.getLogger(__name__)

KMZ_IMPORT_TASK = "kmz_import"
TRIP_PDF_TASK = "trip_pdf_export"


def _active_user(session: Session, user_id: UUID, *, lock: bool = False) -> User:
    query = select(User).where(
        User.id == user_id,
        User.is_active.is_(True),
        User.deleted_at.is_(None),
    )
    if lock:
        query = query.with_for_update()
    user = session.scalar(query.execution_options(populate_existing=True))
    if user is None:
        raise HTTPException(403, "The requesting user is no longer active")
    return user


def _current_map_editor(session: Session, map_id: UUID, user_id: UUID, *, lock: bool = False) -> User:
    """Reload requester and map authority, optionally holding both to commit."""
    user = _active_user(session, user_id, lock=lock)
    if lock:
        # Lock the canonical map and membership rows before the final business
        # commit. A concurrent role downgrade therefore either happens first
        # (and is rejected below) or waits until this transaction commits.
        session.scalar(
            select(PoiMap)
            .where(PoiMap.id == map_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        session.scalar(
            select(MapMembership)
            .where(MapMembership.map_id == map_id, MapMembership.user_id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    require_map_role(session, map_id, user, "editor")
    return user


@task_handler(KMZ_IMPORT_TASK)
def handle_kmz_import(session: Session, task: BackgroundTask, progress: ProgressCallback) -> TaskHandlerResult:
    if task.map_id is None:
        raise HTTPException(422, "The import task has no map")
    user = _current_map_editor(session, task.map_id, task.requested_by_user_id)
    request = KmzConfirmRequest.model_validate(task.input_json)
    cached = get_cached_import(session, request.import_id, task.map_id, user.id)
    report = confirm_import(
        session,
        task.map_id,
        cached,
        request.selected_source_indexes,
        download_remote_images=request.download_remote_images,
        force_indexes=request.force_source_indexes,
        progress_callback=progress,
        authorization_callback=lambda: _current_map_editor(
            session, task.map_id, task.requested_by_user_id, lock=True
        ),
    )
    preview_path = remove_cached_import(session, request.import_id)
    # ``remove_cached_import`` is part of the same transaction as the import.
    # Recheck after it too, immediately before the task finalizer commits.
    _current_map_editor(session, task.map_id, task.requested_by_user_id, lock=True)
    return TaskHandlerResult(
        result=report.model_dump(mode="json"),
        after_commit=(lambda: cleanup_cached_import_file(preview_path),),
    )


@task_handler(TRIP_PDF_TASK)
def handle_trip_pdf(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict:
    if task.resource_id is None:
        raise HTTPException(422, "The PDF task has no trip")
    user = _active_user(session, task.requested_by_user_id)
    access = require_trip_viewer(session, task.resource_id, user)
    # Idempotent finalization: if a previous attempt already committed the
    # canonical export for this task (crash after output commit), reuse it
    # instead of generating a second PDF / second row / double quota.
    existing = find_task_export(session, task.id)
    if existing is not None:
        # Refresh the artifact TTL so the recovered export stays downloadable;
        # the canonical row is reused, never duplicated.
        expires_at = existing.expires_at
        model = session.get(GeneratedExport, existing.export_id)
        if model is not None:
            model.expires_at = datetime.now(UTC) + EXPORT_TTL
            if isinstance(task, TaskClaim):
                ensure_task_held(session, task)
            session.commit()
            expires_at = model.expires_at
        logger.info("task_canonical_output_reused task_id=%s export_id=%s", task.id, existing.export_id)
        progress(3, 3, "Document déjà généré")
        return {
            "export_id": str(existing.export_id),
            "file_name": existing.file_name,
            "download_url": f"/trips/{access.trip.id}/exports/{existing.export_id}/download",
            "expires_at": expires_at.isoformat(),
        }
    progress(0, 3, "Chargement du voyage")
    trip = load_trip(session, access.trip.id)
    options = TripPdfExportOptions.model_validate(task.input_json.get("options", {}))
    locale = str((user.preferences or {}).get("language") or "fr")
    progress(1, 3, "Génération du document PDF")
    item = create_pdf(session, trip, user.id, locale, options, task_id=task.id, claim=task if isinstance(task, TaskClaim) else None)
    progress(2, 3, "Finalisation du document")
    return {
        "export_id": str(item.export_id),
        "file_name": item.file_name,
        "download_url": f"/trips/{trip.id}/exports/{item.export_id}/download",
        "expires_at": item.expires_at.isoformat(),
    }
