"""Small, transaction-friendly audit helpers for place changes."""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.places.models import PlaceHistory


def add_place_history(session: Session, place_id: UUID, user_id: UUID | None, action: str, changes: dict) -> None:
    session.add(PlaceHistory(place_id=place_id, user_id=user_id, action=action, changes=changes))


def json_compatible_value(value: object) -> object:
    """Convert audited domain values to values accepted by PostgreSQL JSONB."""

    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): json_compatible_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_compatible_value(item) for item in value]
    return value


def changed_values(before: dict, after: dict) -> dict:
    return {
        key: {
            "old": json_compatible_value(before.get(key)),
            "new": json_compatible_value(after.get(key)),
        }
        for key in sorted(before.keys() | after.keys())
        if before.get(key) != after.get(key)
    }
