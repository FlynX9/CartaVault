from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.permissions import MapAccess, require_map_role
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripStop


@dataclass(frozen=True)
class TripAccess:
    trip: Trip
    map_access: MapAccess

    @property
    def can_edit(self) -> bool: return self.map_access.can_edit

    @property
    def can_delete(self) -> bool: return self.map_access.can_delete


def require_trip_role(session: Session, trip_id: UUID, user: User, minimum: str) -> TripAccess:
    trip = session.get(Trip, trip_id)
    if trip is None: raise HTTPException(404, "Trip not found")
    return TripAccess(trip, require_map_role(session, trip.map_id, user, minimum))


def require_day_role(session: Session, day_id: UUID, user: User, minimum: str) -> tuple[TripDay, TripAccess]:
    day = session.get(TripDay, day_id)
    if day is None: raise HTTPException(404, "Trip day not found")
    return day, require_trip_role(session, day.trip_id, user, minimum)


def require_stop_role(session: Session, stop_id: UUID, user: User, minimum: str) -> tuple[TripStop, TripAccess]:
    stop = session.get(TripStop, stop_id)
    if stop is None: raise HTTPException(404, "Trip stop not found")
    return stop, require_trip_role(session, stop.day.trip_id, user, minimum)


def require_night_role(session: Session, night_id: UUID, user: User, minimum: str) -> tuple[TripNight, TripAccess]:
    night = session.get(TripNight, night_id)
    if night is None: raise HTTPException(404, "Trip night not found")
    return night, require_trip_role(session, night.trip_id, user, minimum)


def require_departure_role(session: Session, departure_id: UUID, user: User, minimum: str) -> tuple[TripDeparture, TripAccess]:
    departure = session.get(TripDeparture, departure_id)
    if departure is None: raise HTTPException(404, "Trip departure not found")
    return departure, require_trip_role(session, departure.trip_id, user, minimum)


def require_arrival_role(session: Session, arrival_id: UUID, user: User, minimum: str) -> tuple[TripArrival, TripAccess]:
    arrival = session.get(TripArrival, arrival_id)
    if arrival is None: raise HTTPException(404, "Trip arrival not found")
    return arrival, require_trip_role(session, arrival.trip_id, user, minimum)


def require_trip_viewer(session: Session, trip_id: UUID, user: User) -> TripAccess: return require_trip_role(session, trip_id, user, "viewer")
def require_trip_editor(session: Session, trip_id: UUID, user: User) -> TripAccess: return require_trip_role(session, trip_id, user, "editor")
def require_trip_owner(session: Session, trip_id: UUID, user: User) -> TripAccess: return require_trip_role(session, trip_id, user, "owner")
