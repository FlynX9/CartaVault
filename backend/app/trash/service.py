from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.maps.models import PoiMap
from app.places.models import Place
from app.trips.models import Trip


DEFAULT_RETENTION_DAYS = 30
MIN_RETENTION_DAYS = 1
MAX_RETENTION_DAYS = 365


def retention_days(user: User) -> int:
    raw = (user.preferences or {}).get("trash_retention_days", DEFAULT_RETENTION_DAYS)
    if isinstance(raw, bool):
        return DEFAULT_RETENTION_DAYS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_DAYS
    return max(MIN_RETENTION_DAYS, min(MAX_RETENTION_DAYS, value))


def trash_deadline(user: User, *, now: datetime | None = None) -> tuple[datetime, datetime]:
    deleted_at = (now or datetime.now(UTC)).replace(tzinfo=None)
    return deleted_at, deleted_at + timedelta(days=retention_days(user))


def permanently_delete_map(session: Session, map_id: UUID) -> None:
    # Places use RESTRICT toward maps, while trips cascade. Delete dependants in
    # an explicit order so the operation remains deterministic on every schema.
    session.execute(delete(Trip).where(Trip.map_id == map_id))
    session.execute(delete(Place).where(Place.map_id == map_id))
    session.execute(delete(PoiMap).where(PoiMap.id == map_id))


def purge_expired_trash(session: Session, *, now: datetime | None = None) -> dict[str, int]:
    threshold = (now or datetime.now(UTC)).replace(tzinfo=None)
    map_ids = session.scalars(
        select(PoiMap.id).where(PoiMap.deleted_at.is_not(None), PoiMap.purge_after <= threshold)
    ).all()
    for map_id in map_ids:
        permanently_delete_map(session, map_id)

    trip_result = session.execute(
        delete(Trip).where(
            Trip.deleted_at.is_not(None),
            Trip.purge_after <= threshold,
            ~Trip.map_id.in_(map_ids),
        )
    )
    place_result = session.execute(
        delete(Place).where(
            Place.deleted_at.is_not(None),
            Place.purge_after <= threshold,
            ~Place.map_id.in_(map_ids),
        )
    )
    session.commit()
    return {
        "maps": len(map_ids),
        "trips": int(trip_result.rowcount or 0),
        "places": int(place_result.rowcount or 0),
    }
