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
from app.imports.schemas import KmzConfirmRequest, KmzImportReport, KmzPreviewRead
from app.imports.service import cache_preview, confirm_import, get_cached_import, mark_duplicate_items
from app.maps.models import PoiMap


router = APIRouter(prefix="/maps/{map_id}/imports/kmz", tags=["imports"])
logger = logging.getLogger(__name__)


@router.post("/preview", response_model=KmzPreviewRead)
def preview_kmz_import(map_id: UUID, file: UploadFile = File(description="KMZ archive"), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> KmzPreviewRead:
    """Validate and parse a KMZ archive without creating any data."""

    require_map_role(database_session, map_id, current_user, "editor")
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
    return cache_preview(map_id, current_user.id, file.filename or "import.kmz", items, warnings)


@router.post("/confirm", response_model=KmzImportReport, status_code=status.HTTP_201_CREATED)
def confirm_kmz_import(map_id: UUID, request: KmzConfirmRequest, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> KmzImportReport:
    """Persist explicitly selected preview items in one atomic transaction."""

    require_map_role(database_session, map_id, current_user, "editor")
    cached = get_cached_import(request.import_id, map_id, current_user.id)
    return confirm_import(
        database_session,
        map_id,
        cached,
        request.selected_source_indexes,
        download_remote_images=request.download_remote_images,
        force_indexes=request.force_source_indexes,
    )
