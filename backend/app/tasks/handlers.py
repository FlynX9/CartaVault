from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import require_map_role
from app.imports.schemas import KmzConfirmRequest
from app.imports.service import confirm_import, get_cached_import, remove_cached_import
from app.tasks.models import BackgroundTask
from app.tasks.registry import ProgressCallback, task_handler
from app.trips.models import Trip
from app.trips.pdf_export import create_pdf
from app.trips.permissions import require_trip_viewer
from app.trips.schemas import TripPdfExportOptions
from app.media.optimization import optimize_existing_media  # noqa: F401
from app.trips.service import load_trip
from app.basemaps import vector_generation as _vector_generation  # noqa: F401

KMZ_IMPORT_TASK = "kmz_import"
TRIP_PDF_TASK = "trip_pdf_export"


def _active_user(session: Session, user_id: UUID) -> User:
    user = session.get(User, user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(403, "The requesting user is no longer active")
    return user


@task_handler(KMZ_IMPORT_TASK)
def handle_kmz_import(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict:
    if task.map_id is None:
        raise HTTPException(422, "The import task has no map")
    user = _active_user(session, task.requested_by_user_id)
    require_map_role(session, task.map_id, user, "editor")
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
    )
    remove_cached_import(session, request.import_id)
    return report.model_dump(mode="json")


@task_handler(TRIP_PDF_TASK)
def handle_trip_pdf(session: Session, task: BackgroundTask, progress: ProgressCallback) -> dict:
    if task.resource_id is None:
        raise HTTPException(422, "The PDF task has no trip")
    user = _active_user(session, task.requested_by_user_id)
    access = require_trip_viewer(session, task.resource_id, user)
    progress(0, 3, "Chargement du voyage")
    trip = load_trip(session, access.trip.id)
    options = TripPdfExportOptions.model_validate(task.input_json.get("options", {}))
    locale = str((user.preferences or {}).get("language") or "fr")
    progress(1, 3, "Génération du document PDF")
    item = create_pdf(session, trip, user.id, locale, options, task_id=task.id)
    progress(2, 3, "Finalisation du document")
    return {
        "export_id": str(item.export_id),
        "file_name": item.file_name,
        "download_url": f"/trips/{trip.id}/exports/{item.export_id}/download",
        "expires_at": item.expires_at.isoformat(),
    }
