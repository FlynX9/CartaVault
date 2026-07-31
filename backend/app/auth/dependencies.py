from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.models import User, UserSession
from app.auth.security import tokens_match
from app.auth.sessions import load_active_session, persist_session_activity
from app.config import security_settings
from app.database import get_db


def get_current_session(
    request: Request,
    database_session: Session = Depends(get_db),
) -> UserSession:
    token = request.cookies.get(security_settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    now = datetime.now(UTC).replace(tzinfo=None)
    user_session = load_active_session(database_session, token, now, load_user=True)
    if user_session is None or not user_session.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or account inactive")
    persist_session_activity(database_session, user_session, now)
    return user_session


def get_current_user(user_session: UserSession = Depends(get_current_session)) -> User:
    return user_session.user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return current_user


def _invalid_csrf_error() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")


def require_csrf(
    request: Request,
    database_session: Session = Depends(get_db),
) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"} or request.url.path == "/auth/login":
        return
    session_token = request.cookies.get(security_settings.session_cookie_name)
    if session_token is None:
        # Public invitation acceptance has no authenticated cookie to protect.
        return
    csrf_cookie = request.cookies.get(security_settings.csrf_cookie_name)
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
        raise _invalid_csrf_error()
    now = datetime.now(UTC).replace(tzinfo=None)
    user_session = load_active_session(database_session, session_token, now)
    if user_session is None or not tokens_match(csrf_header, user_session.csrf_token_hash):
        raise _invalid_csrf_error()
