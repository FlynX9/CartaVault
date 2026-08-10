from datetime import UTC, datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_session
from app.auth.models import EmailMfaCode, UserSession
from app.auth.registration_security import record_auth_event
from app.auth.schemas import EmailMfaVerification
from app.auth.security import hash_token, verify_password
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database

router = APIRouter(prefix="/account/security/email-mfa", tags=["account"])


def _locale(session: UserSession) -> str:
    return str((session.user.preferences or {}).get("language") or "fr")


def _send_code(session: Session, current: UserSession, purpose: str) -> str:
    if current.user.totp_enabled:
        raise HTTPException(409, "Désactivez d’abord le MFA par application.")
    if not verify_password(current.user.password_hash, purpose)[0]:
        raise HTTPException(400, "Current password is incorrect")
    now = datetime.now(UTC).replace(tzinfo=None)
    raw = secrets.token_urlsafe(32); code = f"{secrets.randbelow(1_000_000):06d}"
    session.execute(update(EmailMfaCode).where(EmailMfaCode.user_id == current.user_id, EmailMfaCode.purpose == "enable", EmailMfaCode.used_at.is_(None)).values(used_at=now))
    session.add(EmailMfaCode(user_id=current.user_id, purpose="enable", challenge_token_hash=hash_token(raw), code_hash=hash_token(code), expires_at=now + timedelta(minutes=10)))
    try:
        EmailService(provider_from_database(session)).send_email_mfa_code(current.user.email, current.user.display_name, code, _locale(current))
    except EmailDeliveryError as error:
        session.rollback(); raise HTTPException(503, "Le facteur e-mail est indisponible.") from error
    session.commit(); record_auth_event(session, "email_mfa_enrollment_started", "accepted", actor_user_id=current.user_id); session.commit()
    return raw


@router.get("")
def status(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    try:
        provider_from_database(session)
        available = True
    except EmailDeliveryError:
        available = False
    return {"enabled": current.user.email_mfa_enabled, "verified_at": current.user.email_mfa_verified_at, "available": available}


@router.post("/setup")
def setup(payload: dict, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    return {"challenge_token": _send_code(session, current, str(payload.get("current_password") or ""))}


@router.post("/confirm")
def confirm(payload: EmailMfaVerification, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict:
    now = datetime.now(UTC).replace(tzinfo=None)
    code = session.scalar(select(EmailMfaCode).where(EmailMfaCode.user_id == current.user_id, EmailMfaCode.purpose == "enable", EmailMfaCode.challenge_token_hash == hash_token(payload.challenge_token)).with_for_update())
    if code is None or code.used_at or code.expires_at <= now or code.attempts >= 5 or hash_token(payload.code) != code.code_hash:
        if code is not None: code.attempts += 1; session.commit()
        raise HTTPException(400, "Invalid or expired authentication code")
    code.used_at = now; current.user.email_mfa_enabled = True; current.user.email_mfa_verified_at = now
    record_auth_event(session, "email_mfa_enabled", "accepted", actor_user_id=current.user_id); session.commit()
    return {"enabled": True, "verified_at": now, "available": True}


@router.post("/disable", status_code=204)
def disable(payload: dict, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> None:
    if not verify_password(current.user.password_hash, str(payload.get("current_password") or ""))[0]: raise HTTPException(400, "Current password is incorrect")
    current.user.email_mfa_enabled = False; current.user.email_mfa_verified_at = None
    record_auth_event(session, "email_mfa_disabled", "accepted", actor_user_id=current.user_id); session.commit()
