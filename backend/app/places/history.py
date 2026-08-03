"""Small, transaction-friendly audit helpers for place changes."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.places.models import PlaceHistory


SENSITIVE_KEY_PARTS = ("password", "secret", "token", "cookie", "api_key", "credential", "fernet")
MAX_TEXT_AUDIT_LENGTH = 500


def _safe_audit_value(key: str, value: object) -> object:
    lowered = key.lower()
    if any(part in lowered for part in SENSITIVE_KEY_PARTS):
        return "[redacted]"
    if lowered == "url" and isinstance(value, str):
        return value.split("?", 1)[0]
    if isinstance(value, str) and len(value) > MAX_TEXT_AUDIT_LENGTH:
        return f"{value[:MAX_TEXT_AUDIT_LENGTH]}… [truncated]"
    if isinstance(value, dict):
        return {str(child_key): _safe_audit_value(key if child_key in {"old", "new"} else str(child_key), child_value) for child_key, child_value in value.items()}
    if isinstance(value, (list, tuple)):
        return [_safe_audit_value(key, item) for item in value]
    return json_compatible_value(value)


def safe_history_changes(changes: dict) -> dict:
    """Keep audit entries useful without retaining credentials or full large texts."""
    return {str(key): _safe_audit_value(str(key), value) for key, value in changes.items()}


def add_place_history(session: Session, place_id: UUID, user_id: UUID | None, action: str, changes: dict) -> None:
    session.add(PlaceHistory(place_id=place_id, user_id=user_id, action=action, changes=safe_history_changes(changes)))


def json_compatible_value(value: object) -> object:
    """Convert audited domain values to values accepted by PostgreSQL JSONB."""

    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
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
