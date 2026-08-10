from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database
from app.saas.settings import saas_enabled, set_saas_enabled


router = APIRouter(tags=["saas"])
admin_router = APIRouter(prefix="/admin/console/saas", tags=["admin-console"], dependencies=[Depends(require_admin)])


class SaasSettings(BaseModel):
    enabled: bool = False


class ContactMessage(BaseModel):
    kind: Literal["incident", "suggestion"]
    message: str = Field(min_length=10, max_length=5000)


def _locale(user: User) -> str:
    value = (user.preferences or {}).get("language")
    return value if value in {"fr", "en"} else "fr"


@router.get("/saas/status", response_model=SaasSettings)
def get_saas_status(session: Session = Depends(get_db), _: User = Depends(get_current_user)) -> SaasSettings:
    return SaasSettings(enabled=saas_enabled(session))


@admin_router.get("/settings", response_model=SaasSettings)
def get_saas_settings(session: Session = Depends(get_db)) -> SaasSettings:
    return SaasSettings(enabled=saas_enabled(session))


@admin_router.put("/settings", response_model=SaasSettings)
def update_saas_settings(payload: SaasSettings, session: Session = Depends(get_db)) -> SaasSettings:
    return SaasSettings(enabled=set_saas_enabled(session, payload.enabled))


@router.post("/contact", status_code=status.HTTP_204_NO_CONTENT)
def send_contact_message(
    payload: ContactMessage,
    session: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    if not saas_enabled(session):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact service is unavailable")
    try:
        EmailService(provider_from_database(session)).send_contact_message(
            sender_email=current.email,
            sender_name=current.display_name,
            kind=payload.kind,
            message=payload.message.strip(),
            locale=_locale(current),
        )
    except EmailDeliveryError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
