from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.exports.schemas import KmzExportCreated, KmzExportOptions
from app.exports.service import create_kmz_export
from app.exports.temporary_exports import get

router = APIRouter(prefix="/maps/{map_id}/exports/kmz", tags=["exports"])


@router.post("", response_model=KmzExportCreated, status_code=201)
def create_export(map_id: UUID, options: KmzExportOptions, session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> KmzExportCreated:
    require_map_role(session, map_id, current_user, "viewer")
    item, report = create_kmz_export(session, map_id, current_user.id, options)
    return KmzExportCreated(export_id=item.export_id, file_name=item.file_name, download_url=f"/maps/{map_id}/exports/kmz/{item.export_id}/download", expires_at=item.expires_at, report=report)


@router.get("/{export_id}/download")
def download_export(map_id: UUID, export_id: UUID, session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> FileResponse:
    require_map_role(session, map_id, current_user, "viewer")
    item = get(export_id, map_id, current_user.id)
    if item is None:
        raise HTTPException(status_code=404, detail="KMZ export not found or expired")
    return FileResponse(item.path, media_type="application/vnd.google-earth.kmz", filename=item.file_name)
