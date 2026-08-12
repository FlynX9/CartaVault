from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.models import UserActivityEvent


USER_ACTIVITY_RETENTION = 100


def record_user_activity(
    session: Session,
    *,
    user_id: UUID,
    event_type: str,
    actor_user_id: UUID | None = None,
    previous_value: str | None = None,
    next_value: str | None = None,
) -> None:
    """Append an audit event and retain only the latest 100 events for one user."""

    session.add(UserActivityEvent(
        user_id=user_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        previous_value=previous_value,
        next_value=next_value,
    ))
    session.flush()
    stale_ids = session.scalars(
        select(UserActivityEvent.id)
        .where(UserActivityEvent.user_id == user_id)
        .order_by(UserActivityEvent.occurred_at.desc(), UserActivityEvent.id.desc())
        .offset(USER_ACTIVITY_RETENTION)
    ).all()
    if stale_ids:
        session.execute(delete(UserActivityEvent).where(UserActivityEvent.id.in_(stale_ids)))
