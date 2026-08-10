from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.database import get_db
from app.instance_status.logs import MAX_LOG_ENTRIES, query_logs
from app.instance_status.settings import get_log_retention_days
from app.instance_status.schemas import InstanceLogPage, InstanceStatusResponse
from app.instance_status.service import get_instance_status


router = APIRouter(prefix="/admin/console", tags=["admin-console"], dependencies=[Depends(require_admin)])


@router.get("/instance", response_model=InstanceStatusResponse)
def instance_status(request: Request, session: Session = Depends(get_db)) -> InstanceStatusResponse:
    return get_instance_status(session, request)


@router.post("/instance/refresh", response_model=InstanceStatusResponse)
def refresh_instance_status(request: Request, session: Session = Depends(get_db)) -> InstanceStatusResponse:
    return get_instance_status(session, request, force=True)


@router.get("/instance/logs", response_model=InstanceLogPage)
def instance_logs(
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None,
    component: str | None = Query(default=None, min_length=1, max_length=32),
    search: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=100, ge=1, le=200),
    before: int | None = Query(default=None, ge=1),
    order: Literal["newest", "oldest"] = "newest",
    session: Session = Depends(get_db),
) -> InstanceLogPage:
    items, truncated, next_before = query_logs(
        level=level, component=component.upper() if component else None,
        search=search, limit=limit, before=before, order=order,
    )
    return InstanceLogPage(
        items=items, truncated=truncated, next_before=next_before,
        max_limit=200, retention_entries=MAX_LOG_ENTRIES, retention_days=get_log_retention_days(session),
    )
