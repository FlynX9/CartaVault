"""HTTP endpoints for the preview-first KMZ import workflow."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.imports.kmz_parser import KmzParseError, parse_kmz
from app.imports.kmz_security import KMZ_MAX_UPLOAD_SIZE, KmzSecurityError, validate_kmz_upload
from app.imports.schemas import (
    KmzConfirmRequest,
    KmzImportJobStart,
    KmzImportProgressRead,
    KmzImportReport,
    KmzPreviewRead,
)
from app.imports.service import cache_preview, confirm_import, get_cached_import, mark_duplicate_items, mark_outside_country_items, remove_cached_import
from app.maps.models import PoiMap
from app.tasks.handlers import KMZ_IMPORT_TASK
from app.tasks.models import BackgroundTask
from app.tasks.service import create_task, submit_task


router = APIRouter(prefix="/maps/{map_id}/imports/kmz", tags=["imports"])
logger = logging.getLogger(__name__)


@router.post("/preview", response_model=KmzPreviewRead)
def preview_kmz_import(map_id: UUID, file: UploadFile = File(description="KMZ archive"), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> KmzPreviewRead:
    """Validate and parse a KMZ archive without creating any data."""

    access = require_map_role(database_session, map_id, current_user, "editor")
    payload = file.file.read(KMZ_MAX_UPLOAD_SIZE + 1)
    try:
        validated = validate_kmz_upload(file.filename, payload)
        try:
            items, warnings = parse_kmz(validated.archive, tuple(entry.filename for entry in validated.entries))
        finally:
            validated.archive.close()
    except (KmzSecurityError, KmzParseError) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    except Exception as error:
        logger.exception(
            "KMZ preview failed for map_id=%s file_name=%s",
            map_id,
            file.filename,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to analyze the KMZ archive",
        ) from error
    mark_duplicate_items(database_session, map_id, items)
    boundary_warning = mark_outside_country_items(access.map, items)
    if boundary_warning:
        warnings.append(boundary_warning)
    result = cache_preview(database_session, map_id, current_user.id, file.filename or "import.kmz", payload, items, warnings)
    database_session.commit()
    return result


@router.post("/confirm", response_model=KmzImportReport, status_code=status.HTTP_201_CREATED)
def confirm_kmz_import(map_id: UUID, request: KmzConfirmRequest, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> KmzImportReport:
    """Persist explicitly selected preview items in one atomic transaction."""

    require_map_role(database_session, map_id, current_user, "editor")
    cached = get_cached_import(database_session, request.import_id, map_id, current_user.id)
    report = confirm_import(
        database_session,
        map_id,
        cached,
        request.selected_source_indexes,
        download_remote_images=request.download_remote_images,
        force_indexes=request.force_source_indexes,
    )
    remove_cached_import(database_session, request.import_id)
    database_session.commit()
    return report


@router.post("/confirm-jobs", response_model=KmzImportJobStart, status_code=status.HTTP_202_ACCEPTED)
def start_kmz_import(
    map_id: UUID,
    request: KmzConfirmRequest,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KmzImportJobStart:
    """Start a long KMZ confirmation and expose its measurable progress."""

    require_map_role(database_session, map_id, current_user, "editor")
    get_cached_import(database_session, request.import_id, map_id, current_user.id)
    task = create_task(
        database_session,
        task_type=KMZ_IMPORT_TASK,
        user_id=current_user.id,
        map_id=map_id,
        resource_type="kmz_import",
        resource_id=request.import_id,
        input_json=request.model_dump(mode="json"),
        dedupe_key=f"kmz:{request.import_id}",
    )
    submit_task(database_session, task)
    return KmzImportJobStart(job_id=task.id)


@router.get("/confirm-jobs/{job_id}", response_model=KmzImportProgressRead)
def read_kmz_import_progress(
    map_id: UUID,
    job_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KmzImportProgressRead:
    """Return progress for an import owned by the authenticated map editor."""

    require_map_role(database_session, map_id, current_user, "editor")
    task = database_session.get(BackgroundTask, job_id)
    if task is None or task.map_id != map_id or task.requested_by_user_id != current_user.id or task.task_type != KMZ_IMPORT_TASK:
        raise HTTPException(status_code=404, detail="KMZ import progress was not found")
    total = max(1, task.progress_total)
    completed = min(task.progress_current, total)
    status_value = "completed" if task.status == "succeeded" else task.status
    if status_value in {"cancelled", "expired"}:
        status_value = "failed"
    return KmzImportProgressRead(
        job_id=task.id,
        status=status_value,
        completed=completed,
        total=total,
        percent=round(completed * 100 / total),
        message=task.progress_message,
        report=task.result_json if task.status == "succeeded" else None,
        error=task.error_message,
    )
