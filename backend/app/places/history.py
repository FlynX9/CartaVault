"""Small, transaction-friendly audit helpers for place changes."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.places.models import PlaceHistory


def add_place_history(session: Session, place_id: UUID, user_id: UUID | None, action: str, changes: dict) -> None:
    session.add(PlaceHistory(place_id=place_id, user_id=user_id, action=action, changes=changes))


def changed_values(before: dict, after: dict) -> dict:
    return {
        key: {"old": before.get(key), "new": after.get(key)}
        for key in sorted(before.keys() | after.keys())
        if before.get(key) != after.get(key)
    }
