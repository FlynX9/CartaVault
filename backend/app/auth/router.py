from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_session
from app.auth.models import AuthActionToken, EmailMfaCode, RegistrationRequest, User, UserSession
from app.auth.rate_limit import public_auth_rate_limiter, rate_limit_key
from app.auth.schemas import EmailMfaLoginChallenge, EmailMfaVerification, LoginRequest, PasswordChange, TotpLoginChallenge, TotpLoginVerification, UserSelfRead
from app.auth.registration_security import record_auth_event
from app.auth.security import generate_token, hash_password, hash_token, normalize_email, verify_password
from app.auth.sessions import issue_session, revoke_user_sessions
from app.auth.totp import consume_recovery_code, verify_code
from app.config import security_settings
from app.database import get_db
from app.emails.notifications import notify_password_changed
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database

router = APIRouter(prefix="/auth", tags=["auth"])
PENDING_REGISTRATION_MESSAGES = {
    "en": "Your account is awaiting administrator approval. You will receive an email once it is activated.",
    "fr": "Votre compte est en attente de validation par un administrateur. Vous recevrez un email dès qu’il sera activé.",
}


def _self_read(user: User, csrf_token: str) -> UserSelfRead:
    return UserSelfRead(
        id=user.id, email=user.email, display_name=user.display_name,
        is_admin=user.is_admin, is_active=user.is_active, created_at=user.created_at,
        updated_at=user.updated_at, last_login_at=user.last_login_at, csrf_token=csrf_token,
        quota_profile_id=user.quota_profile_id,
        avatar_url=f"/account/avatar?v={user.avatar_updated_at.isoformat()}" if user.avatar_filename else None,
    )


def _set_session_cookies(response: Response, token: str, csrf_token: str, max_age: int) -> None:
    response.set_cookie(
        security_settings.session_cookie_name, token, max_age=max_age, httponly=True,
        secure=security_settings.cookie_secure, samesite="lax", path="/",
    )
    response.set_cookie(
        security_settings.csrf_cookie_name, csrf_token, max_age=max_age, httponly=False,
        secure=security_settings.cookie_secure, samesite="lax", path="/",
    )


@router.post("/login", response_model=UserSelfRead | TotpLoginChallenge)
def login(data: LoginRequest, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead | TotpLoginChallenge | EmailMfaLoginChallenge:
    email = normalize_email(str(data.email))
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("login", client_host, email))
    user = database_session.scalar(select(User).where(User.email == email))
    valid, needs_rehash = verify_password(user.password_hash, data.password) if user else (False, False)
    if user is None:
        pending_registration = database_session.scalar(
            select(RegistrationRequest).where(
                RegistrationRequest.email == email,
                RegistrationRequest.status == "pending",
            )
        )
        pending_password_is_valid = (
            pending_registration is not None
            and verify_password(pending_registration.password_hash, data.password)[0]
        )
        if pending_password_is_valid:
            locale = pending_registration.locale if pending_registration.locale in PENDING_REGISTRATION_MESSAGES else "fr"
            raise HTTPException(status_code=403, detail=PENDING_REGISTRATION_MESSAGES[locale])
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if needs_rehash:
        user.password_hash = hash_password(data.password)
    now = datetime.now(UTC).replace(tzinfo=None)
    if user.totp_enabled:
        raw_challenge = generate_token()
        database_session.add(AuthActionToken(user_id=user.id, token_type="totp_login", token_hash=hash_token(raw_challenge), expires_at=now + timedelta(minutes=5)))
        database_session.commit()
        return TotpLoginChallenge(challenge_token=raw_challenge)
    if user.email_mfa_enabled:
        raw_challenge = generate_token()
        code = f"{__import__('secrets').randbelow(1_000_000):06d}"
        database_session.execute(__import__('sqlalchemy').update(EmailMfaCode).where(EmailMfaCode.user_id == user.id, EmailMfaCode.purpose == "login", EmailMfaCode.used_at.is_(None)).values(used_at=now))
        database_session.add(EmailMfaCode(user_id=user.id, purpose="login", challenge_token_hash=hash_token(raw_challenge), code_hash=hash_token(code), expires_at=now + timedelta(minutes=10)))
        try:
            EmailService(provider_from_database(database_session)).send_email_mfa_code(user.email, user.display_name, code, str((user.preferences or {}).get("language") or "fr"))
        except EmailDeliveryError as error:
            database_session.rollback()
            raise HTTPException(503, "Le facteur e-mail est temporairement indisponible.") from error
        database_session.commit()
        return EmailMfaLoginChallenge(challenge_token=raw_challenge)
    raw_token, csrf_token = issue_session(
        database_session,
        user.id,
        user_agent=request.headers.get("user-agent"),
    )
    user.last_login_at = now
    database_session.commit()
    _set_session_cookies(response, raw_token, csrf_token, security_settings.session_days * 86400)
    return _self_read(user, csrf_token)


def _complete_totp_login(data: TotpLoginVerification, request: Request, response: Response, database_session: Session, *, recovery: bool) -> UserSelfRead:
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("totp-recovery-login" if recovery else "totp-login", client_host, data.challenge_token))
    now = datetime.now(UTC).replace(tzinfo=None)
    challenge = database_session.scalar(select(AuthActionToken).where(AuthActionToken.token_hash == hash_token(data.challenge_token), AuthActionToken.token_type == "totp_login").with_for_update())
    if challenge is None or challenge.used_at is not None or challenge.revoked_at is not None or challenge.expires_at <= now:
        raise HTTPException(401, "Authentication challenge expired")
    user = database_session.get(User, challenge.user_id)
    valid = user is not None and user.is_active and user.totp_enabled
    if valid:
        valid = consume_recovery_code(database_session, user, data.code) if recovery else verify_code(user, data.code, reject_replay=True)
    if not valid:
        record_auth_event(database_session, "recovery_code_used" if recovery else "totp_login_failed", "failed", actor_user_id=challenge.user_id, client_ip=client_host)
        database_session.commit()
        raise HTTPException(401, "Invalid authentication code")
    challenge.used_at = now
    raw_token, csrf_token = issue_session(database_session, user.id, user_agent=request.headers.get("user-agent"))
    user.last_login_at = now
    record_auth_event(database_session, "recovery_code_used" if recovery else "totp_login_succeeded", "accepted", actor_user_id=user.id, client_ip=client_host)
    database_session.commit()
    _set_session_cookies(response, raw_token, csrf_token, security_settings.session_days * 86400)
    return _self_read(user, csrf_token)


@router.post("/totp/verify", response_model=UserSelfRead)
def verify_totp_login(data: TotpLoginVerification, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead:
    return _complete_totp_login(data, request, response, database_session, recovery=False)


@router.post("/totp/recovery", response_model=UserSelfRead)
def verify_recovery_login(data: TotpLoginVerification, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead:
    return _complete_totp_login(data, request, response, database_session, recovery=True)


@router.post("/email-mfa/verify", response_model=UserSelfRead)
def verify_email_mfa_login(data: EmailMfaVerification, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead:
    client_host = request.client.host if request.client else "unknown"
    public_auth_rate_limiter.check(rate_limit_key("email-mfa-login", client_host, data.challenge_token))
    now = datetime.now(UTC).replace(tzinfo=None)
    challenge = database_session.scalar(select(EmailMfaCode).where(EmailMfaCode.challenge_token_hash == hash_token(data.challenge_token), EmailMfaCode.purpose == "login").with_for_update())
    if challenge is None or challenge.used_at is not None or challenge.expires_at <= now or challenge.attempts >= 5:
        raise HTTPException(401, "Authentication challenge expired")
    user = database_session.get(User, challenge.user_id)
    if user is None or not user.is_active or not user.email_mfa_enabled or hash_token(data.code) != challenge.code_hash:
        if challenge is not None:
            challenge.attempts += 1
            database_session.commit()
        raise HTTPException(401, "Invalid authentication code")
    challenge.used_at = now
    raw_token, csrf_token = issue_session(database_session, user.id, user_agent=request.headers.get("user-agent"))
    user.last_login_at = now
    record_auth_event(database_session, "email_mfa_login_succeeded", "accepted", actor_user_id=user.id, client_ip=client_host)
    database_session.commit(); _set_session_cookies(response, raw_token, csrf_token, security_settings.session_days * 86400)
    return _self_read(user, csrf_token)


@router.get("/me", response_model=UserSelfRead)
def me(request: Request, user_session: UserSession = Depends(get_current_session)) -> UserSelfRead:
    csrf_token = request.cookies.get(security_settings.csrf_cookie_name)
    if csrf_token is None or hash_token(csrf_token) != user_session.csrf_token_hash:
        raise HTTPException(status_code=401, detail="Session CSRF state is invalid")
    return _self_read(user_session.user, csrf_token)


@router.post("/logout", status_code=204)
def logout(response: Response, database_session: Session = Depends(get_db), user_session: UserSession = Depends(get_current_session)) -> Response:
    user_session.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()
    response.delete_cookie(security_settings.session_cookie_name, path="/")
    response.delete_cookie(security_settings.csrf_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/change-password", status_code=204)
def change_password(data: PasswordChange, response: Response, database_session: Session = Depends(get_db), user_session: UserSession = Depends(get_current_session)) -> Response:
    valid, _ = verify_password(user_session.user.password_hash, data.current_password)
    if not valid:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user_session.user.password_hash = hash_password(data.new_password)
    revoke_user_sessions(database_session, user_session.user_id)
    raw_token, csrf_token = issue_session(database_session, user_session.user_id)
    database_session.commit()
    _set_session_cookies(response, raw_token, csrf_token, security_settings.session_days * 86400)
    notify_password_changed(database_session, user_session.user)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
