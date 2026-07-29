"""Server-side session lifecycle helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.auth.models import UserSession
from app.auth.security import generate_token, hash_token
from app.config import security_settings


def issue_session(
    database_session: Session,
    user_id: UUID,
    *,
    user_agent: str | None = None,
) -> tuple[str, str]:
    """Create an opaque session and return its raw session and CSRF tokens."""

    raw_token, csrf_token = generate_token(), generate_token()
    now = datetime.now(UTC).replace(tzinfo=None)
    database_session.add(
        UserSession(
            user_id=user_id,
            token_hash=hash_token(raw_token),
            csrf_token_hash=hash_token(csrf_token),
            expires_at=now + timedelta(days=security_settings.session_days),
            last_used_at=now,
            user_agent=(user_agent or "")[:512] or None,
        )
    )
    return raw_token, csrf_token


def revoke_user_sessions(database_session: Session, user_id: UUID) -> None:
    """Revoke every active session for a user, including the current session."""

    database_session.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC).replace(tzinfo=None))
    )
