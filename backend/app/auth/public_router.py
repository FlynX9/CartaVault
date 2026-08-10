from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import AuthActionToken, RegistrationRequest, User, UserSession
from app.auth.rate_limit import public_auth_rate_limiter, rate_limit_key
from app.auth.registration_security import CURRENT_TERMS_VERSION, expire_stale_registration_requests, record_auth_event, validate_registration_password
from app.auth.registration_settings import public_registration_enabled, registration_approval_required
from app.quotas.service import QuotaService
from app.auth.schemas import PasswordResetConfirm, PasswordResetRequest, RegistrationCreate, RegistrationVerification, RegistrationVerificationResend
from app.auth.security import generate_token, hash_password, hash_token, normalize_email
from app.config import email_settings, security_settings
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database
from app.emails.notifications import notify_password_changed


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
GENERIC_REGISTRATION_MESSAGE = "Consultez votre messagerie pour confirmer votre adresse avant l’examen de votre demande."
GENERIC_RESET_MESSAGE = "Si un compte correspond à cette adresse, un email de réinitialisation a été envoyé."


@router.get("/registration-status")
def registration_status(database_session: Session = Depends(get_db)) -> dict[str, object]:
    return {
        "enabled": public_registration_enabled(database_session),
        "approval_required": registration_approval_required(database_session),
        "terms_version": CURRENT_TERMS_VERSION,
    }


def _send_verification(database_session: Session, registration: RegistrationRequest, raw_token: str) -> None:
    try:
        EmailService(provider_from_database(database_session)).send_registration_verification(
            registration.email, registration.display_name, raw_token, registration.locale,
        )
        registration.notification_sent_at = datetime.now(UTC).replace(tzinfo=None)
        registration.notification_error_code = None
    except EmailDeliveryError as error:
        registration.notification_error_code = error.code
        logger.warning("registration_verification_email_failed request_id=%s code=%s", registration.id, error.code)


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
def register(data: RegistrationCreate, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    client_host = request.client.host if request.client else "unknown"
    email = normalize_email(str(data.email))
    public_auth_rate_limiter.check(rate_limit_key("register", client_host))
    public_auth_rate_limiter.check(rate_limit_key("register-email", email))
    if not public_registration_enabled(database_session):
        record_auth_event(database_session, "registration.request", "blocked_disabled", email=email, client_ip=client_host)
        database_session.commit()
        logger.warning("public_registration_blocked client=%s", client_host)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Les inscriptions publiques ne sont pas activées.")
    validate_registration_password(data.password, email)
    expire_stale_registration_requests(database_session)
    existing = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email))
    if database_session.scalar(select(User.id).where(User.email == email)) is not None or (existing is not None and existing.status != "expired"):
        hash_password(data.password)
        record_auth_event(database_session, "registration.request", "duplicate", email=email, client_ip=client_host, request=existing)
        database_session.commit()
        return {"status": "pending", "message": GENERIC_REGISTRATION_MESSAGE}
    now = datetime.now(UTC).replace(tzinfo=None)
    raw_token = generate_token()
    registration = existing or RegistrationRequest(email=email)
    registration.display_name = email.split("@", 1)[0][:120]
    registration.password_hash = hash_password(data.password)
    registration.locale = data.locale
    registration.status = "awaiting_email"
    registration.verification_token_hash = hash_token(raw_token)
    registration.verification_expires_at = now + timedelta(hours=security_settings.registration_verification_hours)
    registration.email_verified_at = None
    registration.terms_accepted_at = now
    registration.terms_version = CURRENT_TERMS_VERSION
    if existing is not None:
        registration.created_at = now
        registration.updated_at = now
        registration.reviewed_at = None
        registration.reviewed_by_user_id = None
        registration.notification_sent_at = None
        registration.notification_error_code = None
    try:
        database_session.add(registration)
        database_session.flush()
        record_auth_event(database_session, "registration.request", "accepted", email=email, client_ip=client_host, request=registration)
        database_session.commit()
    except IntegrityError:
        database_session.rollback()
        return {"status": "pending", "message": GENERIC_REGISTRATION_MESSAGE}
    _send_verification(database_session, registration, raw_token)
    database_session.commit()
    # Keep the response indistinguishable from duplicate-account requests.
    return {"status": "pending", "message": GENERIC_REGISTRATION_MESSAGE}


@router.post("/register/verify", status_code=status.HTTP_202_ACCEPTED)
def verify_registration_email(data: RegistrationVerification, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("registration-verify", client_host))
    now = datetime.now(UTC).replace(tzinfo=None)
    registration = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.verification_token_hash == hash_token(data.token)).with_for_update())
    if registration is None or registration.status != "awaiting_email" or registration.verification_expires_at is None or registration.verification_expires_at <= now:
        record_auth_event(database_session, "registration.email_verification", "invalid", client_ip=client_host)
        database_session.commit()
        raise HTTPException(400, "Le lien de vérification est invalide ou expiré.")
    registration.email_verified_at = now
    registration.verification_token_hash = None
    record_auth_event(database_session, "registration.email_verification", "verified", email=registration.email, client_ip=client_host, request=registration)
    if not registration_approval_required(database_session):
        if database_session.scalar(select(User.id).where(User.email == registration.email)) is not None:
            raise HTTPException(409, "Un compte utilise déjà cette adresse email.")
        profile = QuotaService(database_session).resolve_profile(None, lock=True)
        user = User(
            email=registration.email,
            display_name=registration.display_name,
            password_hash=registration.password_hash,
            is_admin=False,
            is_active=True,
            quota_profile_id=profile.id,
            preferences={"language": registration.locale},
        )
        registration.status = "approved"
        registration.reviewed_at = now
        record_auth_event(database_session, "registration.review", "auto_approved", email=registration.email, client_ip=client_host, request=registration)
        try:
            database_session.add(user)
            database_session.commit()
        except IntegrityError as error:
            database_session.rollback()
            raise HTTPException(409, "Un compte utilise déjà cette adresse email.") from error
        try:
            EmailService(provider_from_database(database_session)).notify_registration_approved(user.email, user.display_name, registration.locale)
            registration.notification_sent_at = now
            registration.notification_error_code = None
        except EmailDeliveryError as error:
            registration.notification_error_code = error.code
        database_session.commit()
        return {"status": "approved", "message": "Votre adresse est vérifiée. Votre compte CartaVault est prêt."}

    registration.status = "pending"
    admins = list(database_session.scalars(select(User).where(User.is_admin.is_(True), User.is_active.is_(True))))
    database_session.commit()
    try:
        service = EmailService(provider_from_database(database_session))
        for locale in ("fr", "en"):
            recipients = [admin.email for admin in admins if (admin.preferences or {}).get("language", "fr") == locale]
            if recipients:
                service.notify_registration_admins(recipients, registration.email, locale)
        registration.notification_sent_at = now
        registration.notification_error_code = None
    except EmailDeliveryError as error:
        registration.notification_error_code = error.code
    database_session.commit()
    return {"status": "pending", "message": "Votre adresse est vérifiée. La demande attend maintenant la validation d’un administrateur."}


@router.post("/register/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_registration_verification(data: RegistrationVerificationResend, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    client_host = request.client.host if request.client else "unknown"
    email = normalize_email(data.email)
    public_auth_rate_limiter.check(rate_limit_key("registration-resend", client_host, email))
    registration = database_session.scalar(select(RegistrationRequest).where(RegistrationRequest.email == email).with_for_update())
    if registration is not None and registration.status == "awaiting_email":
        now = datetime.now(UTC).replace(tzinfo=None)
        raw_token = generate_token()
        registration.verification_token_hash = hash_token(raw_token)
        registration.verification_expires_at = now + timedelta(hours=security_settings.registration_verification_hours)
        _send_verification(database_session, registration, raw_token)
        record_auth_event(database_session, "registration.email_verification_resend", "sent", email=email, client_ip=client_host, request=registration)
        database_session.commit()
    return {"message": GENERIC_REGISTRATION_MESSAGE}


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(data: PasswordResetRequest, request: Request, database_session: Session = Depends(get_db)) -> dict[str, str]:
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("password-reset", client_host))
    user = database_session.scalar(select(User).where(User.email == normalize_email(str(data.email)), User.is_active.is_(True), User.deleted_at.is_(None)))
    if user is not None:
        now = datetime.now(UTC).replace(tzinfo=None)
        database_session.execute(update(AuthActionToken).where(AuthActionToken.user_id == user.id, AuthActionToken.token_type == "password_reset", AuthActionToken.used_at.is_(None), AuthActionToken.revoked_at.is_(None)).values(revoked_at=now))
        raw_token = generate_token()
        token = AuthActionToken(user_id=user.id, token_type="password_reset", token_hash=hash_token(raw_token), expires_at=now + timedelta(minutes=email_settings.password_reset_token_ttl_minutes))
        database_session.add(token)
        database_session.commit()
        try:
            locale = str((user.preferences or {}).get("language") or data.locale)
            EmailService(provider_from_database(database_session)).send_password_reset(user.email, user.display_name, raw_token, locale)
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
    notify_password_changed(database_session, user)
    return None
