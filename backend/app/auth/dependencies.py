from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth.models import User, UserSession
from app.auth.security import hash_token, tokens_match
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
    user_session = database_session.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(
            UserSession.token_hash == hash_token(token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
    )
    if user_session is None or not user_session.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or account inactive")
    user_session.last_used_at = now
    database_session.commit()
    return user_session


def get_current_user(user_session: UserSession = Depends(get_current_session)) -> User:
    return user_session.user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return current_user


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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    user_session = database_session.scalar(
        select(UserSession).where(
            UserSession.token_hash == hash_token(session_token),
            UserSession.revoked_at.is_(None),
        )
    )
    if user_session is None or not tokens_match(csrf_header, user_session.csrf_token_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
