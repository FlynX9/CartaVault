from datetime import datetime, timedelta

import pytest

from app.auth.sessions import session_activity_write_is_due


pytestmark = pytest.mark.unit


def test_session_activity_throttle_boundary_is_inclusive() -> None:
    last_used_at = datetime(2026, 7, 31, 8, 0, 0)
    interval_seconds = 300

    assert not session_activity_write_is_due(
        last_used_at,
        last_used_at + timedelta(seconds=interval_seconds, microseconds=-1),
        interval_seconds=interval_seconds,
    )
    assert session_activity_write_is_due(
        last_used_at,
        last_used_at + timedelta(seconds=interval_seconds),
        interval_seconds=interval_seconds,
    )
