from datetime import time
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.trips.summary_service import day_summary, trip_summary

pytestmark = pytest.mark.unit


def stop(minutes: int, *, place_id=None):
    return SimpleNamespace(visit_duration_minutes=minutes, is_required=True, visit_status="planned", place_id=place_id)


def day(*, status="ready", distance=184_320, duration=13_320, visits=(330,), limit=None, buffer=0, margin_type="fixed", margin_value=0, target=None, start=None, trip=None):
    item = SimpleNamespace(
        id=uuid4(),
        route_status=status,
        route_distance_meters=distance,
        route_duration_seconds=duration,
        route_segments=[],
        stops=[stop(minutes) for minutes in visits],
        max_total_duration_minutes=limit,
        default_stop_buffer_minutes=buffer,
        safety_margin_type=margin_type,
        safety_margin_value=margin_value,
        target_arrival_time=target,
        planned_start_time=start,
        trip=trip,
    )
    return item


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


@pytest.mark.parametrize(("visits", "buffer", "expected"), [((30,), 15, 0), ((30, 30), 15, 15), ((30, 30, 30), 10, 20)])
def test_buffer_applies_only_between_real_stops(visits, buffer, expected) -> None:
    assert day_summary(day(visits=visits, buffer=buffer))["buffer_duration_minutes"] == expected


def test_fixed_and_percentage_safety_margins_feed_the_total_without_pauses() -> None:
    fixed = day_summary(day(duration=3600, visits=(30, 30), buffer=10, margin_type="fixed", margin_value=20))
    percentage = day_summary(day(duration=3600, visits=(30, 30), buffer=10, margin_type="percentage", margin_value=15))

    assert fixed["safety_margin_minutes"] == 20
    assert fixed["total_duration_minutes"] == 150
    assert fixed["pause_duration_minutes"] == 0
    assert percentage["safety_margin_minutes"] == 20  # ceil(130 * 15%)
    assert percentage["total_duration_minutes"] == 150


def test_recommended_start_and_estimated_arrival_cross_midnight() -> None:
    summary = day_summary(day(duration=7200, visits=(60,), target=time(1, 0), start=time(23, 30)))

    assert summary["recommended_start_time"] == time(22, 0)
    assert summary["recommended_start_day_offset"] == -1
    assert summary["planned_start_time"] == time(22, 0)
    assert summary["estimated_arrival_time"] == time(1, 0)
    assert summary["estimated_arrival_day_offset"] == 1
    assert summary["schedule_delta_minutes"] == 0
    assert summary["schedule_status"] == "on_time"


def test_default_arrival_is_twenty_hours_and_drives_the_recommended_start() -> None:
    summary = day_summary(day(duration=7200, visits=(60,), target=None, start=time(8, 0)))

    assert summary["target_arrival_time"] == time(20, 0)
    assert summary["recommended_start_time"] == time(17, 0)
    assert summary["planned_start_time"] == time(17, 0)
    assert summary["estimated_arrival_time"] == time(20, 0)


@pytest.mark.parametrize(("minutes", "level"), [(240, "low"), (241, "medium"), (480, "medium"), (481, "high")])
def test_load_threshold_boundaries_and_custom_colors(minutes, level) -> None:
    trip = SimpleNamespace(low_load_max_minutes=240, medium_load_max_minutes=480, low_load_color="#111111", medium_load_color="#222222", high_load_color="#333333")
    summary = day_summary(day(duration=minutes * 60, visits=(), trip=trip))

    assert summary["load_level"] == level
    assert summary["load_color"] == {"low": "#111111", "medium": "#222222", "high": "#333333"}[level]


def test_missing_route_keeps_time_summary_unavailable() -> None:
    summary = day_summary(day(status="stale", duration=3600, visits=(60,), target=time(18), start=time(9)))

    assert summary["safety_margin_minutes"] is None
    assert summary["recommended_start_time"] is None
    assert summary["estimated_arrival_time"] is None
    assert summary["load_level"] == "unavailable"
    assert summary["is_time_summary_complete"] is False
