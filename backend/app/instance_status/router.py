from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.instance_status.schemas import InstanceStatusResponse
from app.instance_status.service import get_instance_status


router = APIRouter(prefix="/admin/console", tags=["admin-console"], dependencies=[Depends(require_admin)])


@router.get("/instance", response_model=InstanceStatusResponse)
def instance_status(request: Request, session: Session = Depends(get_db)) -> InstanceStatusResponse:
    return get_instance_status(session, request)


@router.post("/instance/refresh", response_model=InstanceStatusResponse)
def refresh_instance_status(request: Request, session: Session = Depends(get_db)) -> InstanceStatusResponse:
    return get_instance_status(session, request, force=True)
