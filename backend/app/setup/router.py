from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import SystemCredential, User
from app.auth.rate_limit import public_auth_rate_limiter, rate_limit_key
from app.auth.security import hash_password, normalize_email
from app.database import get_db
from app.quotas.models import UNLIMITED_PROFILE_ID
from app.setup.schemas import (
    SetupCompletion,
    SetupCompletionResult,
    SetupStatus,
    SetupTokenVerification,
)
from app.setup.service import setup_is_locked, technical_checks, verify_setup_token


router = APIRouter(prefix="/setup", tags=["setup"])


def _guard_setup(
    request: Request,
    session: Session,
    provided_token: str | None,
) -> None:
    if setup_is_locked(session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup is unavailable.")
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("initial-setup", client_host))
    if not provided_token or not verify_setup_token(provided_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid setup token.")


@router.get("/status", response_model=SetupStatus)
def get_setup_status(session: Session = Depends(get_db)) -> SetupStatus:
    locked = setup_is_locked(session)
    return SetupStatus(
        required=not locked,
        locked=locked,
        checks=[] if locked else technical_checks(session),
    )


@router.post("/verify-token", response_model=SetupTokenVerification)
def verify_token(
    request: Request,
    x_cartavault_setup_token: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> SetupTokenVerification:
    _guard_setup(request, session, x_cartavault_setup_token)
    return SetupTokenVerification(valid=True)


@router.post("/complete", response_model=SetupCompletionResult)
def complete_setup(
    payload: SetupCompletion,
    request: Request,
    x_cartavault_setup_token: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> SetupCompletionResult:
    _guard_setup(request, session, x_cartavault_setup_token)
    email = normalize_email(payload.administrator.email)
    if "@" not in email:
        raise HTTPException(status_code=422, detail="A valid administrator email is required.")
    if session.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="This email address is already registered.")

    instance_values = payload.instance.model_dump(mode="json")
    instance_values["public_url"] = str(payload.instance.public_url).rstrip("/")
    email_values = payload.email.model_dump(exclude={"api_key"})
    try:
        administrator = User(
            email=email,
            display_name=payload.administrator.display_name.strip(),
            password_hash=hash_password(payload.administrator.password),
            is_admin=True,
            is_active=True,
            quota_profile_id=UNLIMITED_PROFILE_ID,
            preferences={
                "language": payload.administrator.language,
                "timezone": payload.administrator.timezone,
            },
        )
        session.add(administrator)
        session.add_all([
            SystemSetting(key="instance", value=instance_values),
            SystemSetting(key="email", value=email_values),
            SystemSetting(key="mapping", value=payload.mapping.model_dump()),
            SystemSetting(
                key="setup.completed",
                value={"completed": True, "completed_at": datetime.now(UTC).isoformat()},
            ),
        ])
        if payload.email.provider == "resend" and payload.email.api_key:
            encrypted = CredentialEncryptionService.from_settings().encrypt(payload.email.api_key)
            session.add(SystemCredential(
                provider="resend",
                encrypted_secret=encrypted.ciphertext,
                encryption_version=encrypted.version,
                secret_last4=payload.email.api_key[-4:],
            ))
        session.commit()
    except (CredentialEncryptionError, IntegrityError, SQLAlchemyError) as error:
        session.rollback()
        raise HTTPException(status_code=500, detail="Initial setup could not be completed.") from error
    return SetupCompletionResult(completed=True, administrator_email=email)
