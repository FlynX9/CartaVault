from datetime import date, datetime
from uuid import uuid4

import pytest

from app.places.history import changed_values, safe_history_changes


pytestmark = pytest.mark.unit


def test_changed_values_serializes_jsonb_domain_values() -> None:
    old_status_id = uuid4()
    new_status_id = uuid4()

    changes = changed_values(
        {"status_id": old_status_id, "metadata": {"captured": date(2026, 7, 21)}},
        {"status_id": new_status_id, "metadata": {"captured": datetime(2026, 7, 22, 12, 30)}},
    )

    assert changes == {
        "metadata": {
            "old": {"captured": "2026-07-21"},
            "new": {"captured": "2026-07-22T12:30:00"},
        },
        "status_id": {"old": str(old_status_id), "new": str(new_status_id)},
    }


def test_history_redacts_secrets_and_bounds_long_text() -> None:
    changes = safe_history_changes({"api_key": {"old": "secret", "new": "other"}, "url": {"old": None, "new": "https://example.test/file?token=private"}, "description": {"old": None, "new": "x" * 501}})

    assert changes["api_key"] == "[redacted]"
    assert changes["url"]["new"] == "https://example.test/file"
    assert changes["description"]["new"].endswith("… [truncated]")
