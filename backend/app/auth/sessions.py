"""Server-side session lifecycle helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import case, select, update
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import set_committed_value

from app.auth.models import UserSession
from app.auth.security import generate_token, hash_token
from app.config import security_settings


def load_active_session(
    database_session: Session,
    raw_token: str,
    now: datetime,
    *,
    load_user: bool = False,
) -> UserSession | None:
    """Load an unexpired, non-revoked session from an opaque cookie token."""

    statement = select(UserSession).where(
        UserSession.token_hash == hash_token(raw_token),
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
    )
    if load_user:
        statement = statement.options(joinedload(UserSession.user))
    return database_session.scalar(statement)


def session_activity_write_is_due(
    last_used_at: datetime,
    now: datetime,
    *,
    interval_seconds: int | None = None,
) -> bool:
    """Return whether persisted activity is older than the accepted precision."""

    interval = interval_seconds or security_settings.session_activity_write_interval_seconds
    return last_used_at <= now - timedelta(seconds=interval)


def persist_session_activity(
    database_session: Session,
    user_session: UserSession,
    now: datetime,
    *,
    interval_seconds: int | None = None,
) -> bool:
    """Persist activity at most once per interval without allowing regression.

    The conditional UPDATE is evaluated by the database. If several requests
    observed the same stale timestamp, only the first one remains eligible
    after the row lock is released.
    """

    interval = interval_seconds or security_settings.session_activity_write_interval_seconds
    cutoff = now - timedelta(seconds=interval)
    if user_session.last_used_at > cutoff:
        return False
    result = database_session.execute(
        update(UserSession)
        .where(
            UserSession.id == user_session.id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
            UserSession.last_used_at <= cutoff,
        )
        .values(
            last_used_at=case(
                (UserSession.last_used_at < now, now),
                else_=UserSession.last_used_at,
            )
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        return False
    database_session.commit()
    set_committed_value(user_session, "last_used_at", now)
    return True


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
