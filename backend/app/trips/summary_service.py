from __future__ import annotations

from collections import Counter
from datetime import time
from math import ceil

from app.trips.models import Trip, TripDay

DEFAULT_TARGET_ARRIVAL_TIME = time(20, 0)


def _has_current_route(day: TripDay) -> bool:
    return day.route_status == "ready" and day.route_distance_meters is not None and day.route_duration_seconds is not None


def calculate_buffer_duration(stop_count: int, buffer_per_transition: int) -> int:
    """Apply one buffer between consecutive real TripStop visits; anchors and TripNight are excluded."""
    return max(0, stop_count - 1) * buffer_per_transition


def calculate_safety_margin(base_duration_minutes: int, margin_type: str, margin_value: int) -> int:
    if margin_type == "percentage":
        return ceil(base_duration_minutes * margin_value / 100)
    return margin_value


def _clock_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _clock_from_absolute(minutes: int) -> tuple[time, int]:
    day_offset, clock = divmod(minutes, 24 * 60)
    return time(clock // 60, clock % 60), day_offset


def calculate_recommended_start(target: time | None, total_minutes: int | None) -> tuple[time | None, int | None]:
    if target is None or total_minutes is None:
        return None, None
    return _clock_from_absolute(_clock_minutes(target) - total_minutes)


def calculate_estimated_arrival(start: time | None, total_minutes: int | None) -> tuple[time | None, int | None, int | None]:
    if start is None or total_minutes is None:
        return None, None, None
    absolute = _clock_minutes(start) + total_minutes
    arrival, offset = _clock_from_absolute(absolute)
    return arrival, offset, absolute


def calculate_load_level(total_minutes: int | None, trip: Trip | None) -> tuple[str, str | None]:
    if total_minutes is None:
        return "unavailable", None
    low_max = getattr(trip, "low_load_max_minutes", 240)
    medium_max = getattr(trip, "medium_load_max_minutes", 480)
    if total_minutes <= low_max:
        return "low", getattr(trip, "low_load_color", "#0FA68A")
    if total_minutes <= medium_max:
        return "medium", getattr(trip, "medium_load_color", "#D97706")
    return "high", getattr(trip, "high_load_color", "#DC2626")


def day_summary(day: TripDay) -> dict:
    visit = sum(stop.visit_duration_minutes or 0 for stop in day.stops)
    buffer = calculate_buffer_duration(len(day.stops), getattr(day, "default_stop_buffer_minutes", 0))
    has_route = _has_current_route(day)
    distance = float(day.route_distance_meters) if has_route else None
    driving = float(day.route_duration_seconds) if has_route else None
    driving_minutes = round(driving / 60) if driving is not None else None
    base_duration = driving_minutes + visit + buffer if driving_minutes is not None else None
    safety = calculate_safety_margin(base_duration, getattr(day, "safety_margin_type", "fixed"), getattr(day, "safety_margin_value", 0)) if base_duration is not None else None
    total = base_duration + safety if base_duration is not None and safety is not None else None
    limit = day.max_total_duration_minutes or 0
    target = getattr(day, "target_arrival_time", None) or DEFAULT_TARGET_ARRIVAL_TIME
    recommended_start, recommended_offset = calculate_recommended_start(target, total)
    # The start is derived from the desired arrival and the complete day duration.
    # Keep the legacy response field populated for API compatibility, but never use
    # a separately entered start time in the planning calculation.
    planned_start = recommended_start
    estimated_arrival, estimated_offset, estimated_absolute = calculate_estimated_arrival(planned_start, total)
    target_absolute = _clock_minutes(target) if target is not None else None
    if target_absolute is not None and planned_start is not None and target_absolute < _clock_minutes(planned_start):
        target_absolute += 24 * 60
    schedule_delta = estimated_absolute - target_absolute if estimated_absolute is not None and target_absolute is not None else None
    schedule_status = "unavailable" if schedule_delta is None else "late" if schedule_delta > 0 else "early" if schedule_delta < 0 else "on_time"
    trip = getattr(day, "trip", None)
    load_level, load_color = calculate_load_level(total, trip)
    return {
        "day_id": day.id,
        "stops": len(day.stops),
        "required_stops": sum(stop.is_required for stop in day.stops),
        "optional_stops": sum(not stop.is_required for stop in day.stops),
        "distance_meters": distance,
        "route_distance_meters": distance,
        "route_distance_km": round(distance / 1000, 1) if distance is not None else None,
        "route_duration_seconds": driving,
        "route_duration_minutes": driving_minutes,
        "visit_duration_minutes": visit,
        "pause_duration_minutes": 0,
        "buffer_duration_minutes": buffer,
        "safety_margin_minutes": safety,
        "total_duration_minutes": total,
        "overload_minutes": max(0, total - limit) if limit and total is not None else 0,
        "unroutable_segments": sum(1 for item in (day.route_segments or []) if item.get("routable") is False),
        "route_status": day.route_status,
        "route_is_stale": day.route_status == "stale",
        "has_current_route": has_route,
        "planned_start_time": planned_start,
        "target_arrival_time": target,
        "recommended_start_time": recommended_start,
        "recommended_start_day_offset": recommended_offset,
        "estimated_arrival_time": estimated_arrival,
        "estimated_arrival_day_offset": estimated_offset,
        "schedule_delta_minutes": schedule_delta,
        "schedule_status": schedule_status,
        "load_level": load_level,
        "load_color": load_color,
        "is_time_summary_complete": has_route,
    }


def trip_summary(trip: Trip) -> dict:
    summaries = [day_summary(day) for day in trip.days]
    stops = [stop for day in trip.days for stop in day.stops]
    counts = Counter(stop.visit_status for stop in stops)
    current = [item for item in summaries if item["has_current_route"]]
    load_counts = Counter(item["load_level"] for item in summaries)
    distance = sum(item["route_distance_meters"] for item in current)
    driving = sum(item["route_duration_seconds"] for item in current)
    visit = sum(item["visit_duration_minutes"] for item in summaries)
    buffer = sum(item["buffer_duration_minutes"] for item in summaries)
    safety = sum(item["safety_margin_minutes"] or 0 for item in summaries)
    # Keep every known component in a partial global total. Missing/stale routes
    # remove only their unknown driving time and safety margin, not visit/buffer time.
    total = round(driving / 60) + visit + buffer + safety
    incomplete = len(summaries) - len(current)
    return {
        "trip_id": trip.id,
        "days": len(trip.days),
        "nights": len(trip.nights),
        "stops": len(stops),
        "unique_places": len({stop.place_id for stop in stops if stop.place_id}),
        "distance_meters": distance,
        "route_duration_seconds": driving,
        "visit_duration_minutes": visit,
        "total_duration_minutes": total,
        "visit_status_counts": dict(counts),
        "total_route_distance_meters": distance,
        "total_route_distance_km": round(distance / 1000, 1),
        "total_route_duration_seconds": driving,
        "total_route_duration_minutes": round(driving / 60),
        "total_visit_duration_minutes": visit,
        "total_pause_duration_minutes": 0,
        "total_buffer_duration_minutes": buffer,
        "total_safety_margin_minutes": safety,
        "total_estimated_duration_minutes": total,
        "total_planned_duration_minutes": total,
        "days_with_route": len(current),
        "days_without_route": incomplete,
        "stale_route_days": sum(item["route_is_stale"] for item in summaries),
        "is_route_summary_complete": incomplete == 0,
        "low_load_days": load_counts["low"],
        "medium_load_days": load_counts["medium"],
        "high_load_days": load_counts["high"],
        "days_with_complete_time_summary": len(current),
        "days_with_incomplete_time_summary": incomplete,
        "is_time_summary_complete": incomplete == 0,
    }
