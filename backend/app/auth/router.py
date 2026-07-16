from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_session
from app.auth.models import User, UserSession
from app.auth.schemas import LoginRequest, PasswordChange, UserSelfRead
from app.auth.security import generate_token, hash_password, hash_token, normalize_email, verify_password
from app.config import security_settings
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


def _self_read(user: User, csrf_token: str) -> UserSelfRead:
    return UserSelfRead(
        id=user.id, email=user.email, display_name=user.display_name,
        is_admin=user.is_admin, is_active=user.is_active, created_at=user.created_at,
        updated_at=user.updated_at, last_login_at=user.last_login_at, csrf_token=csrf_token,
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


@router.post("/login", response_model=UserSelfRead)
def login(data: LoginRequest, request: Request, response: Response, database_session: Session = Depends(get_db)) -> UserSelfRead:
    user = database_session.scalar(select(User).where(User.email == normalize_email(str(data.email))))
    valid, needs_rehash = verify_password(user.password_hash, data.password) if user else (False, False)
    if user is None or not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    if needs_rehash:
        user.password_hash = hash_password(data.password)
    raw_token, csrf_token = generate_token(), generate_token()
    now = datetime.now(UTC).replace(tzinfo=None)
    expires_at = now + timedelta(days=security_settings.session_days)
    user_session = UserSession(
        user_id=user.id, token_hash=hash_token(raw_token), csrf_token_hash=hash_token(csrf_token),
        expires_at=expires_at, last_used_at=now, user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    user.last_login_at = now
    database_session.add(user_session)
    database_session.commit()
    _set_session_cookies(response, raw_token, csrf_token, security_settings.session_days * 86400)
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
def change_password(data: PasswordChange, database_session: Session = Depends(get_db), user_session: UserSession = Depends(get_current_session)) -> Response:
    valid, _ = verify_password(user_session.user.password_hash, data.current_password)
    if not valid:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user_session.user.password_hash = hash_password(data.new_password)
    now = datetime.now(UTC).replace(tzinfo=None)
    database_session.execute(
        update(UserSession).where(UserSession.user_id == user_session.user_id, UserSession.id != user_session.id).values(revoked_at=now)
    )
    database_session.commit()
    return Response(status_code=204)
