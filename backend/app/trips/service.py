from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.places.models import Place
from app.trips.models import Trip, TripDay, TripNight, TripStop
from app.trips.routing.base import RoutingError, RoutingProvider
from app.trips.summary_service import day_summary


DAY_COLOR_PALETTE = ("#0FA68A", "#2563EB", "#9333EA", "#D97706", "#DC2626", "#0891B2", "#65A30D", "#DB2777")


def next_day_color(days: list[TripDay]) -> str:
    used = {day.color.upper() for day in days if getattr(day, "color", None)}
    return next((color for color in DAY_COLOR_PALETTE if color not in used), DAY_COLOR_PALETTE[len(days) % len(DAY_COLOR_PALETTE)])


def load_trip(session: Session, trip_id: UUID) -> Trip:
    trip = session.scalar(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.days).selectinload(TripDay.stops),
            selectinload(Trip.nights),
            selectinload(Trip.departure),
            selectinload(Trip.arrival),
        )
        .execution_options(populate_existing=True)
    )
    if trip is None: raise HTTPException(404, "Trip not found")
    return trip


def place_snapshot(session: Session, place_id: UUID, map_id: UUID) -> tuple[Place, float, float]:
    place = session.get(Place, place_id)
    if place is None or place.map_id != map_id: raise HTTPException(422, "Place must belong to the trip map")
    longitude, latitude = session.execute(select(func.ST_X(Place.location), func.ST_Y(Place.location)).where(Place.id == place_id)).one()
    if longitude is None or latitude is None: raise HTTPException(422, "Place has no usable coordinates")
    return place, float(latitude), float(longitude)


def stale(day: TripDay) -> None:
    if day.route_status == "ready": day.route_status = "stale"


def normalize_day_order(trip: Trip) -> None:
    for index, day in enumerate(sorted(trip.days, key=lambda item: item.sort_order)):
        day.sort_order = index; day.day_number = index + 1


def normalize_stop_order(day: TripDay) -> None:
    for index, stop in enumerate(sorted(day.stops, key=lambda item: item.sort_order)): stop.sort_order = index


def day_coordinates(day: TripDay) -> tuple[list[tuple[float, float]], list[str]]:
    coordinates: list[tuple[float, float]] = []
    labels: list[str] = []
    if day.previous_night:
        coordinates.append((day.previous_night.longitude, day.previous_night.latitude)); labels.append(f"night:{day.previous_night.id}")
    elif day.day_number == 1 and day.trip.departure:
        coordinates.append((day.trip.departure.longitude, day.trip.departure.latitude)); labels.append(f"departure:{day.trip.departure.id}")
    for stop in sorted(day.stops, key=lambda item: item.sort_order):
        coordinates.append((stop.longitude, stop.latitude)); labels.append(f"stop:{stop.id}")
    if day.next_night:
        coordinates.append((day.next_night.longitude, day.next_night.latitude)); labels.append(f"night:{day.next_night.id}")
    elif day.day_number == len(day.trip.days):
        arrival = getattr(day.trip, "arrival", None) or getattr(day.trip, "departure", None)
        if arrival:
            coordinates.append((arrival.longitude, arrival.latitude)); labels.append(f"arrival:{arrival.id}")
    return coordinates, labels


def calculate_day_route(session: Session, day: TripDay, provider: RoutingProvider, profile: str) -> TripDay:
    coordinates, labels = day_coordinates(day)
    if len(coordinates) < 2: raise HTTPException(422, "At least two route points are required")
    try: result = provider.calculate_route(coordinates, profile)
    except RoutingError as error: raise HTTPException(502, str(error)) from error
    day.route_geometry = result.geometry
    day.route_distance_meters = result.distance_meters
    day.route_duration_seconds = result.duration_seconds
    day.route_segments = [{**segment, "from": labels[index], "to": labels[index + 1], "routable": True} for index, segment in enumerate(result.segments)]
    day.route_status = "ready"
    metrics = day_summary(day)
    day.visit_duration_minutes = metrics["visit_duration_minutes"]
    day.total_duration_minutes = metrics["total_duration_minutes"]
    session.commit()
    return day
