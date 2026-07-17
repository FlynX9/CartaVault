from __future__ import annotations

from collections import Counter

from app.trips.models import Trip, TripDay


def day_summary(day: TripDay) -> dict:
    visit = sum(stop.visit_duration_minutes or 0 for stop in day.stops)
    driving = float(day.route_duration_seconds or 0)
    total = round(driving / 60) + visit
    limit = day.max_total_duration_minutes or 0
    return {"day_id": day.id, "stops": len(day.stops), "required_stops": sum(stop.is_required for stop in day.stops), "optional_stops": sum(not stop.is_required for stop in day.stops), "distance_meters": float(day.route_distance_meters or 0), "route_duration_seconds": driving, "visit_duration_minutes": visit, "total_duration_minutes": total, "overload_minutes": max(0, total - limit) if limit else 0, "unroutable_segments": sum(1 for item in (day.route_segments or []) if item.get("routable") is False)}


def trip_summary(trip: Trip) -> dict:
    summaries = [day_summary(day) for day in trip.days]
    stops = [stop for day in trip.days for stop in day.stops]
    counts = Counter(stop.visit_status for stop in stops)
    return {"trip_id": trip.id, "days": len(trip.days), "nights": len(trip.nights), "stops": len(stops), "unique_places": len({stop.place_id for stop in stops if stop.place_id}), "distance_meters": sum(item["distance_meters"] for item in summaries), "route_duration_seconds": sum(item["route_duration_seconds"] for item in summaries), "visit_duration_minutes": sum(item["visit_duration_minutes"] for item in summaries), "total_duration_minutes": sum(item["total_duration_minutes"] for item in summaries), "visit_status_counts": dict(counts)}
