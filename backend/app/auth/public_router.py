from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import AuthActionToken, RegistrationRequest, User, UserSession
from app.auth.rate_limit import public_auth_rate_limiter
from app.auth.schemas import PasswordResetConfirm, PasswordResetRequest, RegistrationCreate
from app.auth.security import generate_token, hash_password, hash_token, normalize_email
from app.config import email_settings
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
GENERIC_RESET_MESSAGE = "Si un compte correspond à cette adresse, un email de réinitialisation a été envoyé."


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
def register(data: RegistrationCreate, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    public_auth_rate_limiter.check(f"register:{request.client.host if request.client else 'unknown'}")
    email = normalize_email(str(data.email))
    if database_session.scalar(select(User.id).where(User.email == email)) is not None or database_session.scalar(select(RegistrationRequest.id).where(RegistrationRequest.email == email)) is not None:
        raise HTTPException(409, "Une inscription existe déjà pour cette adresse email.")
    request = RegistrationRequest(email=email, display_name=email.split("@", 1)[0][:120], password_hash=hash_password(data.password))
    try:
        database_session.add(request)
        database_session.commit()
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(409, "Une inscription existe déjà pour cette adresse email.") from error
    admins = list(database_session.scalars(select(User.email).where(User.is_admin.is_(True), User.is_active.is_(True))))
    try:
        if admins:
            EmailService(provider_from_database(database_session)).notify_registration_admins(admins, email)
            request.notification_sent_at = datetime.now(UTC).replace(tzinfo=None)
            request.notification_error_code = None
    except EmailDeliveryError as error:
        request.notification_error_code = error.code
        logger.warning("registration_admin_email_failed request_id=%s code=%s", request.id, error.code)
    database_session.commit()
    return {"status": "pending", "message": "Votre demande a été transmise aux administrateurs."}


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(data: PasswordResetRequest, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    public_auth_rate_limiter.check(f"password-reset:{request.client.host if request.client else 'unknown'}")
    user = database_session.scalar(select(User).where(User.email == normalize_email(str(data.email)), User.is_active.is_(True), User.deleted_at.is_(None)))
    if user is not None:
        now = datetime.now(UTC).replace(tzinfo=None)
        database_session.execute(update(AuthActionToken).where(AuthActionToken.user_id == user.id, AuthActionToken.token_type == "password_reset", AuthActionToken.used_at.is_(None), AuthActionToken.revoked_at.is_(None)).values(revoked_at=now))
        raw_token = generate_token()
        token = AuthActionToken(user_id=user.id, token_type="password_reset", token_hash=hash_token(raw_token), expires_at=now + timedelta(minutes=email_settings.password_reset_token_ttl_minutes))
        database_session.add(token)
        database_session.commit()
        try:
            EmailService(provider_from_database(database_session)).send_password_reset(user.email, user.display_name, raw_token)
        except EmailDeliveryError as error:
            token.revoked_at = now
            database_session.commit()
            logger.warning("password_reset_email_failed user_id=%s code=%s", user.id, error.code)
    return {"message": GENERIC_RESET_MESSAGE}


@router.post("/password-reset/confirm", status_code=204)
def confirm_password_reset(data: PasswordResetConfirm, database_session: Session = Depends(get_db)) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    token = database_session.scalar(select(AuthActionToken).where(AuthActionToken.token_hash == hash_token(data.token), AuthActionToken.token_type == "password_reset").with_for_update())
    if token is None or token.used_at is not None or token.revoked_at is not None or token.expires_at <= now:
        raise HTTPException(400, "Le lien de réinitialisation est invalide ou expiré.")
    user = database_session.get(User, token.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(400, "Le lien de réinitialisation est invalide ou expiré.")
    user.password_hash = hash_password(data.password)
    token.used_at = now
    database_session.execute(update(AuthActionToken).where(AuthActionToken.user_id == user.id, AuthActionToken.token_type == "password_reset", AuthActionToken.id != token.id, AuthActionToken.used_at.is_(None)).values(revoked_at=now))
    database_session.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=now))
    database_session.commit()
    return None
