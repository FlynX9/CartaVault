from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.trips.summary_service import day_summary, trip_summary

pytestmark = pytest.mark.unit


def stop(minutes: int, *, place_id=None):
    return SimpleNamespace(visit_duration_minutes=minutes, is_required=True, visit_status="planned", place_id=place_id)


def day(*, status="ready", distance=184_320, duration=13_320, visits=(330,), limit=None):
    return SimpleNamespace(
        id=uuid4(),
        route_status=status,
        route_distance_meters=distance,
        route_duration_seconds=duration,
        route_segments=[],
        stops=[stop(minutes) for minutes in visits],
        max_total_duration_minutes=limit,
    )


def test_day_summary_keeps_raw_route_metrics_separate_from_planned_time() -> None:
    summary = day_summary(day())

    assert summary["route_distance_meters"] == 184_320
    assert summary["route_distance_km"] == 184.3
    assert summary["route_duration_seconds"] == 13_320
    assert summary["route_duration_minutes"] == 222
    assert summary["visit_duration_minutes"] == 330
    assert summary["pause_duration_minutes"] == 0
    assert summary["buffer_duration_minutes"] == 0
    assert summary["total_duration_minutes"] == 552


def test_missing_and_stale_routes_are_not_reported_as_current_zero_values() -> None:
    missing = day_summary(day(status=None, distance=None, duration=None, visits=(60,)))
    stale = day_summary(day(status="stale", distance=1000, duration=120, visits=(60,)))

    assert missing["route_distance_meters"] is None
    assert missing["route_duration_seconds"] is None
    assert missing["total_duration_minutes"] is None
    assert stale["route_distance_meters"] is None
    assert stale["route_duration_seconds"] is None
    assert stale["route_is_stale"] is True


def test_trip_summary_sums_only_current_routes_and_marks_partial_totals() -> None:
    ready = day(distance=100_000, duration=7200, visits=(60,))
    stale = day(status="stale", distance=500_000, duration=50_000, visits=(90,))
    missing = day(status=None, distance=None, duration=None, visits=(30,))
    trip = SimpleNamespace(id=uuid4(), days=[ready, stale, missing], nights=[])

    summary = trip_summary(trip)

    assert summary["total_route_distance_meters"] == 100_000
    assert summary["total_route_duration_seconds"] == 7200
    assert summary["total_visit_duration_minutes"] == 180
    assert summary["total_estimated_duration_minutes"] == 300
    assert summary["days_with_route"] == 1
    assert summary["days_without_route"] == 2
    assert summary["stale_route_days"] == 1
    assert summary["is_route_summary_complete"] is False


def test_empty_trip_has_a_complete_zero_route_summary() -> None:
    summary = trip_summary(SimpleNamespace(id=uuid4(), days=[], nights=[]))

    assert summary["total_route_distance_meters"] == 0
    assert summary["total_route_duration_seconds"] == 0
    assert summary["days_without_route"] == 0
    assert summary["is_route_summary_complete"] is True
