from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import require_admin
from app.auth.models import RegistrationRequest, SystemCredential, User
from app.auth.schemas import RegistrationRequestRead
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database
from app.quotas.schemas import RegistrationApproval
from app.quotas.service import QuotaService


router = APIRouter(prefix="/admin", tags=["administration"], dependencies=[Depends(require_admin)])


@router.get("/registration-requests", response_model=list[RegistrationRequestRead])
def list_registration_requests(database_session: Session = Depends(get_db)) -> list[RegistrationRequest]:
    return list(database_session.scalars(select(RegistrationRequest).order_by(RegistrationRequest.created_at.desc())))


@router.post("/registration-requests/{request_id}/approve", response_model=RegistrationRequestRead)
def approve_registration(request_id: UUID, payload: RegistrationApproval | None = None, database_session: Session = Depends(get_db), admin: User = Depends(require_admin)) -> RegistrationRequest:
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(404, "Demande d’inscription introuvable.")
    if request.status != "pending":
        raise HTTPException(409, "Cette demande a déjà été traitée.")
    if database_session.scalar(select(User.id).where(User.email == request.email)) is not None:
        raise HTTPException(409, "Un compte utilise déjà cette adresse email.")
    now = datetime.now(UTC).replace(tzinfo=None)
    profile = QuotaService(database_session).resolve_profile(payload.quota_profile_id if payload else None, lock=True)
    user = User(email=request.email, display_name=request.display_name, password_hash=request.password_hash, is_admin=False, is_active=True, quota_profile_id=profile.id)
    request.status = "approved"; request.reviewed_at = now; request.reviewed_by_user_id = admin.id
    try:
        database_session.add(user)
        database_session.commit()
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(409, "Un compte utilise déjà cette adresse email.") from error
    try:
        EmailService(provider_from_database(database_session)).notify_registration_approved(user.email, user.display_name)
        request.notification_sent_at = datetime.now(UTC).replace(tzinfo=None); request.notification_error_code = None
    except EmailDeliveryError as error:
        request.notification_error_code = error.code
    database_session.commit()
    return request


@router.post("/registration-requests/{request_id}/reject", response_model=RegistrationRequestRead)
def reject_registration(request_id: UUID, database_session: Session = Depends(get_db), admin: User = Depends(require_admin)) -> RegistrationRequest:
    request = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.id == request_id).with_for_update())
    if request is None:
        raise HTTPException(404, "Demande d’inscription introuvable.")
    if request.status != "pending":
        raise HTTPException(409, "Cette demande a déjà été traitée.")
    request.status = "rejected"; request.reviewed_at = datetime.now(UTC).replace(tzinfo=None); request.reviewed_by_user_id = admin.id
    database_session.commit()
    return request


def _email_status(credential: SystemCredential | None) -> dict[str, object]:
    return {"configured": credential is not None, "last4": credential.secret_last4 if credential else None}


@router.get("/email-settings")
def get_email_settings(database_session: Session = Depends(get_db)) -> dict[str, object]:
    return _email_status(database_session.get(SystemCredential, "resend"))


@router.put("/email-settings")
def update_email_settings(payload: dict[str, object], database_session: Session = Depends(get_db)) -> dict[str, object]:
    value = payload.get("api_key")
    if not isinstance(value, str) or not value.strip().startswith("re_") or len(value.strip()) > 512:
        raise HTTPException(422, "Une clé API Resend valide est requise.")
    api_key = value.strip()
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(api_key)
    except CredentialEncryptionError as error:
        raise HTTPException(503, str(error)) from error
    credential = database_session.get(SystemCredential, "resend")
    if credential is None:
        credential = SystemCredential(provider="resend", encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=api_key[-4:])
        database_session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext; credential.encryption_version = encrypted.version; credential.secret_last4 = api_key[-4:]
    database_session.commit()
    return _email_status(credential)
