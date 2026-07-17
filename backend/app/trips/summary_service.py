from __future__ import annotations

from collections import Counter

from app.trips.models import Trip, TripDay


def _has_current_route(day: TripDay) -> bool:
    return (
        day.route_status == "ready"
        and day.route_distance_meters is not None
        and day.route_duration_seconds is not None
    )


def day_summary(day: TripDay) -> dict:
    visit = sum(stop.visit_duration_minutes or 0 for stop in day.stops)
    has_route = _has_current_route(day)
    distance = float(day.route_distance_meters) if has_route else None
    driving = float(day.route_duration_seconds) if has_route else None
    driving_minutes = round(driving / 60) if driving is not None else None
    pause = 0
    buffer = 0
    total = driving_minutes + visit + pause + buffer if driving_minutes is not None else None
    limit = day.max_total_duration_minutes or 0
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
        "pause_duration_minutes": pause,
        "buffer_duration_minutes": buffer,
        "total_duration_minutes": total,
        "overload_minutes": max(0, total - limit) if limit and total is not None else 0,
        "unroutable_segments": sum(1 for item in (day.route_segments or []) if item.get("routable") is False),
        "route_status": day.route_status,
        "route_is_stale": day.route_status == "stale",
        "has_current_route": has_route,
    }


def trip_summary(trip: Trip) -> dict:
    summaries = [day_summary(day) for day in trip.days]
    stops = [stop for day in trip.days for stop in day.stops]
    counts = Counter(stop.visit_status for stop in stops)
    current = [item for item in summaries if item["has_current_route"]]
    distance = sum(item["route_distance_meters"] for item in current)
    driving = sum(item["route_duration_seconds"] for item in current)
    visit = sum(item["visit_duration_minutes"] for item in summaries)
    pause = sum(item["pause_duration_minutes"] for item in summaries)
    buffer = sum(item["buffer_duration_minutes"] for item in summaries)
    days_without_route = len(summaries) - len(current)
    total = round(driving / 60) + visit + pause + buffer
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
        "total_pause_duration_minutes": pause,
        "total_buffer_duration_minutes": buffer,
        "total_estimated_duration_minutes": total,
        "days_with_route": len(current),
        "days_without_route": days_without_route,
        "stale_route_days": sum(item["route_is_stale"] for item in summaries),
        "is_route_summary_complete": days_without_route == 0,
    }
