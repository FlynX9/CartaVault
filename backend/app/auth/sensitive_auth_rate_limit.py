from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User, UserSession
from app.auth.registration_security import record_auth_event
from app.auth.security import verify_password


PASSWORD_FAILURE_LIMIT = 5
PASSWORD_FAILURE_WINDOW = timedelta(minutes=15)
EMAIL_MFA_SEND_COOLDOWN = timedelta(seconds=60)
EMAIL_MFA_SEND_LIMIT = 5
EMAIL_MFA_SEND_WINDOW = timedelta(hours=1)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _limited(retry_after: int) -> HTTPException:
    return HTTPException(429, "Too many security-sensitive attempts. Try again later.", headers={"Retry-After": str(max(1, retry_after))})


def _locked_user(session: Session, current: UserSession) -> User:
    return session.scalar(select(User).where(User.id == current.user_id).with_for_update())


def verify_current_password(session: Session, current: UserSession, password: str, *, password_verifier=verify_password) -> None:
    """Verify a current password under a per-user, cross-session failure limit."""

    user = _locked_user(session, current)
    now = _now()
    window_started = user.sensitive_auth_failure_window_started_at
    if window_started is not None and window_started > now - PASSWORD_FAILURE_WINDOW and user.sensitive_auth_failure_count >= PASSWORD_FAILURE_LIMIT:
        record_auth_event(session, "sensitive_auth_rate_limited", "rejected", actor_user_id=user.id)
        session.commit()
        raise _limited(int((window_started + PASSWORD_FAILURE_WINDOW - now).total_seconds()))
    if window_started is None or window_started <= now - PASSWORD_FAILURE_WINDOW:
        user.sensitive_auth_failure_window_started_at = now
        user.sensitive_auth_failure_count = 0
    if not password_verifier(user.password_hash, password)[0]:
        user.sensitive_auth_failure_count += 1
        session.commit()
        raise HTTPException(400, "Current password is incorrect")
    user.sensitive_auth_failure_count = 0
    user.sensitive_auth_failure_window_started_at = None
    session.commit()


def reserve_email_mfa_send(session: Session, current: UserSession) -> None:
    """Reserve one email MFA delivery while holding the user row lock."""

    user = _locked_user(session, current)
    now = _now()
    cooldown_until = (user.email_mfa_last_sent_at or now - EMAIL_MFA_SEND_COOLDOWN) + EMAIL_MFA_SEND_COOLDOWN
    window_started = user.email_mfa_send_window_started_at
    if user.email_mfa_last_sent_at is not None and cooldown_until > now:
        record_auth_event(session, "email_mfa_send_rate_limited", "rejected", actor_user_id=user.id)
        session.commit()
        raise _limited(int((cooldown_until - now).total_seconds()))
    if window_started is None or window_started <= now - EMAIL_MFA_SEND_WINDOW:
        user.email_mfa_send_window_started_at = now
        user.email_mfa_send_count = 0
        window_started = now
    if user.email_mfa_send_count >= EMAIL_MFA_SEND_LIMIT:
        record_auth_event(session, "email_mfa_send_rate_limited", "rejected", actor_user_id=user.id)
        session.commit()
        raise _limited(int((window_started + EMAIL_MFA_SEND_WINDOW - now).total_seconds()))
    user.email_mfa_last_sent_at = now
    user.email_mfa_send_count += 1
