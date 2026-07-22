from datetime import date, datetime
from uuid import uuid4

import pytest

from app.places.history import changed_values


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
