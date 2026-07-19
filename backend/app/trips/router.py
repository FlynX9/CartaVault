from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.credential_encryption import CredentialEncryptionService
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.database import get_db
from app.exports.temporary_exports import get as get_export
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.trips.export_service import create_gpx, create_kmz, google_maps_links
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripStop
from app.trips.optimizer import optimize_matrix, path_cost
from app.trips.permissions import require_arrival_role, require_day_role, require_departure_role, require_night_role, require_stop_role, require_trip_editor, require_trip_owner, require_trip_viewer
from app.trips.routing.registry import routing_preferences, routing_provider_registry
from app.trips.routing.base import RoutingConstraints, RoutingError, RoutingProvider
from app.trips.schemas import ApplyPlaceStatuses, ArrivalCreate, ArrivalRead, ArrivalUpdate, DayCreate, DayRead, DaySummaryRead, DayUpdate, DepartureCreate, DepartureRead, DepartureUpdate, IdOrder, NightCreate, NightRead, NightUpdate, OptimizeConfirm, OptimizeOptions, StopCreate, StopMove, StopRead, StopUpdate, TripCreate, TripDayTimingUpdate, TripLoadSettings, TripRead, TripSummaryRead, TripUpdate
from app.trips.service import CountryRouteError, DAY_COLOR_PALETTE, calculate_day_route, load_trip, next_day_color, normalize_day_order, place_snapshot, stale, resolve_constraint_country
from app.trips.routing.country_validator import CountryRouteValidator
from app.trips.summary_service import day_summary, trip_summary

router = APIRouter(tags=["trips"])


def get_routing_provider(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> RoutingProvider:
    preferences = routing_preferences(user.preferences)
    try:
        return routing_provider_registry.resolve(session, user, str(preferences["provider"]), preferences)
    except RoutingError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


def _routing_constraints(user: User) -> RoutingConstraints:
    return RoutingConstraints(stay_in_country=routing_preferences(user.preferences)["stay_in_country"] is True)


@router.get("/routing/providers")
def routing_providers(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    return {"providers": routing_provider_registry.capabilities(session, user), "default_provider": "osrm", "credential_storage_available": CredentialEncryptionService.configured()}


def _day_constraint_summary(session: Session, user: User, day: TripDay) -> dict[str, object]:
    constraints = _routing_constraints(user)
    if not constraints.stay_in_country:
        return {"country_constraint_enabled": False, "country_constraint_status": "not_applicable", "constraint_country_code": None, "constraint_country_name": None}
    try:
        country = resolve_constraint_country(session, day.trip)
    except CountryRouteError:
        return {"country_constraint_enabled": True, "country_constraint_status": "unavailable", "constraint_country_code": None, "constraint_country_name": None}
    base = {"country_constraint_enabled": True, "constraint_country_code": country.iso_alpha3, "constraint_country_name": country.name}
    if day.route_status != "ready" or not day.route_geometry:
        return {**base, "country_constraint_status": "unchecked"}
    validation = CountryRouteValidator().validate_route_within_country(day.route_geometry, country.iso_alpha3)
    return {**base, "country_constraint_status": "valid" if validation.is_valid else "unavailable" if validation.reason == "boundary_unavailable" else "invalid"}


def _assert_export_routes(session: Session, user: User, trip: Trip) -> None:
    if not _routing_constraints(user).stay_in_country:
        return
    for day in trip.days:
        state = _day_constraint_summary(session, user, day)
        if state["country_constraint_status"] in {"invalid", "unavailable"}:
            raise CountryRouteError("ROUTE_LEAVES_COUNTRY", "Une journée ne possède pas d’itinéraire conforme au pays et ne peut pas être exportée.", country_code=state.get("constraint_country_code") if isinstance(state.get("constraint_country_code"), str) else None)


def _trip_read(session: Session, trip_id: UUID) -> TripRead: return TripRead.model_validate(load_trip(session, trip_id))


@router.get("/maps/{map_id}/trips", response_model=list[TripRead])
def list_trips(map_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_map_role(session, map_id, user, "viewer")
    ids = session.scalars(select(Trip.id).where(Trip.map_id == map_id).order_by(Trip.archived_at.is_not(None), Trip.updated_at.desc())).all()
    return [_trip_read(session, item) for item in ids]


@router.post("/maps/{map_id}/trips", response_model=TripRead, status_code=201)
def create_trip(map_id: UUID, data: TripCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_map_role(session, map_id, user, "editor")
    trip = Trip(map_id=map_id, created_by_user_id=user.id, **data.model_dump()); session.add(trip); session.flush()
    session.add(TripDay(trip_id=trip.id, day_number=1, sort_order=0, color=DAY_COLOR_PALETTE[0])); session.commit()
    return _trip_read(session, trip.id)


@router.get("/trips/{trip_id}", response_model=TripRead)
def read_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user); return _trip_read(session, trip_id)


@router.patch("/trips/{trip_id}", response_model=TripRead)
def update_trip(trip_id: UUID, data: TripUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip
    values = data.model_dump(exclude_unset=True)
    start_date = values.get("start_date", trip.start_date); end_date = values.get("end_date", trip.end_date)
    if start_date and end_date and end_date < start_date: raise HTTPException(422, "End date must follow start date")
    for key, value in values.items(): setattr(trip, key, value)
    session.commit(); return _trip_read(session, trip_id)


@router.patch("/trips/{trip_id}/load-settings", response_model=TripRead)
def update_trip_load_settings(trip_id: UUID, data: TripLoadSettings, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip
    for key, value in data.model_dump().items(): setattr(trip, key, value)
    session.commit(); return _trip_read(session, trip_id)


@router.delete("/trips/{trip_id}", status_code=204)
def remove_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_owner(session, trip_id, user).trip; session.delete(trip); session.commit()


@router.post("/trips/{trip_id}/archive", response_model=TripRead)
def archive_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip; trip.status = "archived"; trip.archived_at = datetime.now(UTC).replace(tzinfo=None); session.commit(); return _trip_read(session, trip_id)


@router.post("/trips/{trip_id}/duplicate", response_model=TripRead, status_code=201)
def duplicate_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    copy = Trip(map_id=source.map_id, created_by_user_id=user.id, name=f"{source.name} — copie", description=source.description, start_date=source.start_date, end_date=source.end_date, routing_profile=source.routing_profile, low_load_max_minutes=source.low_load_max_minutes, medium_load_max_minutes=source.medium_load_max_minutes, low_load_color=source.low_load_color, medium_load_color=source.medium_load_color, high_load_color=source.high_load_color)
    session.add(copy); session.flush(); days: dict[UUID, TripDay] = {}
    for item in source.days:
        day = TripDay(trip_id=copy.id, day_number=item.day_number, date=item.date, title=item.title, color=item.color, notes=item.notes, planned_start_time=item.planned_start_time, planned_end_time=item.planned_end_time, target_arrival_time=item.target_arrival_time, default_stop_buffer_minutes=item.default_stop_buffer_minutes, safety_margin_type=item.safety_margin_type, safety_margin_value=item.safety_margin_value, max_total_duration_minutes=item.max_total_duration_minutes, sort_order=item.sort_order)
        session.add(day); session.flush(); days[item.id] = day
        for stop in item.stops: session.add(TripStop(trip_day_id=day.id, place_id=stop.place_id, stop_type=stop.stop_type, name=stop.name, latitude=stop.latitude, longitude=stop.longitude, address=stop.address, sort_order=stop.sort_order, visit_duration_minutes=stop.visit_duration_minutes, notes=stop.notes, is_required=stop.is_required, is_locked=stop.is_locked, visit_status="planned"))
    for night in source.nights: session.add(TripNight(trip_id=copy.id, previous_day_id=days[night.previous_day_id].id, next_day_id=days[night.next_day_id].id, place_id=night.place_id, name=night.name, latitude=night.latitude, longitude=night.longitude, address=night.address, notes=night.notes, check_in_time=night.check_in_time, check_out_time=night.check_out_time))
    if source.departure: session.add(TripDeparture(trip_id=copy.id, place_id=source.departure.place_id, name=source.departure.name, latitude=source.departure.latitude, longitude=source.departure.longitude, address=source.departure.address, notes=source.departure.notes, departure_time=source.departure.departure_time))
    if source.arrival: session.add(TripArrival(trip_id=copy.id, place_id=source.arrival.place_id, name=source.arrival.name, latitude=source.arrival.latitude, longitude=source.arrival.longitude, address=source.arrival.address, notes=source.arrival.notes))
    session.commit(); return _trip_read(session, copy.id)


@router.post("/trips/{trip_id}/days", response_model=DayRead, status_code=201)
def add_day(trip_id: UUID, data: DayCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id); index = len(trip.days)
    values = data.model_dump(exclude={"color"})
    day = TripDay(trip_id=trip.id, day_number=index + 1, sort_order=index, color=data.color or next_day_color(trip.days), **values); session.add(day); session.commit(); return DayRead.model_validate(day)


@router.patch("/trip-days/{day_id}", response_model=DayRead)
def update_day(day_id: UUID, data: DayUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "editor")
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(day, key, value)
    session.commit(); return DayRead.model_validate(day)


@router.patch("/trip-days/{day_id}/timing", response_model=DaySummaryRead)
def update_day_timing(day_id: UUID, data: TripDayTimingUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "editor")
    for key, value in data.model_dump().items(): setattr(day, key, value)
    metrics = day_summary(day)
    day.visit_duration_minutes = metrics["visit_duration_minutes"]
    day.total_duration_minutes = metrics["total_duration_minutes"]
    session.commit(); return day_summary(day)


@router.delete("/trip-days/{day_id}", status_code=204)
def remove_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, access = require_day_role(session, day_id, user, "editor")
    if len(load_trip(session, access.trip.id).days) <= 1: raise HTTPException(422, "A trip must keep at least one day")
    trip_id = day.trip_id
    # Delete links first: SQLAlchemy otherwise tries to null a non-nullable FK before
    # PostgreSQL's ON DELETE CASCADE can remove the overnight row.
    session.execute(delete(TripNight).where((TripNight.previous_day_id == day_id) | (TripNight.next_day_id == day_id)))
    session.delete(day)
    session.flush()
    normalize_day_order(load_trip(session, trip_id))
    session.commit()


@router.post("/trips/{trip_id}/days/reorder", response_model=TripRead)
def reorder_days(trip_id: UUID, data: IdOrder, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    if set(data.ids) != {day.id for day in trip.days} or len(data.ids) != len(trip.days): raise HTTPException(422, "Day order must contain every day exactly once")
    positions = {item: index for index, item in enumerate(data.ids)}
    nights = session.scalars(select(TripNight).where(TripNight.trip_id == trip.id)).all()
    if any(positions[night.next_day_id] != positions[night.previous_day_id] + 1 for night in nights): raise HTTPException(422, "Days connected by a night must remain consecutive and ordered")
    for day in trip.days: day.sort_order += 10_000; day.day_number += 10_000
    session.flush(); lookup = {day.id: day for day in trip.days}
    for index, item in enumerate(data.ids): lookup[item].sort_order = index; lookup[item].day_number = index + 1
    session.commit(); return _trip_read(session, trip_id)


@router.post("/trip-days/{day_id}/duplicate", response_model=DayRead, status_code=201)
def duplicate_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source, _ = require_day_role(session, day_id, user, "editor"); trip = load_trip(session, source.trip_id)
    for day in trip.days: day.sort_order += 10_000; day.day_number += 10_000
    session.flush(); ordered = sorted(trip.days, key=lambda item: item.sort_order); insertion = ordered.index(source) + 1
    for index, item in enumerate(ordered): item.sort_order = index if index < insertion else index + 1; item.day_number = item.sort_order + 1
    copy = TripDay(trip_id=trip.id, day_number=insertion + 1, sort_order=insertion, date=source.date, title=f"{source.title or f'Jour {source.day_number}'} — copie", color=next_day_color(trip.days), notes=source.notes, planned_start_time=source.planned_start_time, planned_end_time=source.planned_end_time, target_arrival_time=source.target_arrival_time, default_stop_buffer_minutes=source.default_stop_buffer_minutes, safety_margin_type=source.safety_margin_type, safety_margin_value=source.safety_margin_value, max_total_duration_minutes=source.max_total_duration_minutes)
    session.add(copy); session.flush()
    if source.next_night is not None: source.next_night.previous_day = copy
    for stop in source.stops: session.add(TripStop(trip_day_id=copy.id, place_id=stop.place_id, stop_type=stop.stop_type, name=stop.name, latitude=stop.latitude, longitude=stop.longitude, address=stop.address, sort_order=stop.sort_order, visit_duration_minutes=stop.visit_duration_minutes, notes=stop.notes, is_required=stop.is_required, is_locked=stop.is_locked))
    session.commit(); return DayRead.model_validate(copy)


@router.post("/trip-days/{day_id}/stops", response_model=StopRead, status_code=201)
def add_stop(day_id: UUID, data: StopCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, access = require_day_role(session, day_id, user, "editor"); values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude, stop_type="place")
    stop = TripStop(trip_day_id=day.id, sort_order=len(day.stops), **values); session.add(stop); stale(day); session.commit(); return StopRead.model_validate(stop)


@router.patch("/trip-stops/{stop_id}", response_model=StopRead)
def update_stop(stop_id: UUID, data: StopUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stop, _ = require_stop_role(session, stop_id, user, "editor")
    values = data.model_dump(exclude_unset=True)
    for key, value in values.items(): setattr(stop, key, value)
    if {"latitude", "longitude"} & values.keys(): stale(stop.day)
    session.commit(); return StopRead.model_validate(stop)


@router.delete("/trip-stops/{stop_id}", status_code=204)
def remove_stop(stop_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stop, _ = require_stop_role(session, stop_id, user, "editor")
    day = stop.day
    day_id = day.id
    session.delete(stop)
    session.flush()

    remaining = list(session.scalars(
        select(TripStop)
        .where(TripStop.trip_day_id == day_id)
        .order_by(TripStop.sort_order, TripStop.id)
    ))
    for item in remaining:
        item.sort_order += 10_000
    session.flush()
    for index, item in enumerate(remaining):
        item.sort_order = index

    stale(day)
    session.commit()


@router.post("/trip-days/{day_id}/stops/reorder", response_model=DayRead)
def reorder_stops(day_id: UUID, data: IdOrder, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "editor")
    if set(data.ids) != {item.id for item in day.stops} or len(data.ids) != len(day.stops): raise HTTPException(422, "Stop order must contain every stop exactly once")
    for stop in day.stops: stop.sort_order += 10_000
    session.flush(); lookup = {stop.id: stop for stop in day.stops}
    for index, item in enumerate(data.ids): lookup[item].sort_order = index
    stale(day); session.commit(); return DayRead.model_validate(day)


@router.post("/trip-stops/{stop_id}/move", response_model=TripRead)
def move_stop(stop_id: UUID, data: StopMove, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stop, access = require_stop_role(session, stop_id, user, "editor"); target, target_access = require_day_role(session, data.target_day_id, user, "editor")
    if target.trip_id != access.trip.id: raise HTTPException(422, "A stop can only move inside its trip")
    source = stop.day
    source_items = sorted((item for item in source.stops if item.id != stop.id), key=lambda item: item.sort_order)
    target_items = source_items if source.id == target.id else sorted(target.stops, key=lambda item: item.sort_order)
    for item in {item.id: item for item in [*source.stops, *target.stops]}.values(): item.sort_order += 10_000
    session.flush()
    if source.id != target.id:
        stop.day = target
        for index, item in enumerate(source_items): item.sort_order = index
    target_items = [item for item in target_items if item.id != stop.id]
    target_items.insert(min(data.sort_order, len(target_items)), stop)
    for index, item in enumerate(target_items): item.sort_order = index
    stale(source)
    stale(target); session.commit(); return _trip_read(session, access.trip.id)


@router.post("/trips/{trip_id}/nights", response_model=NightRead, status_code=201)
def add_night(trip_id: UUID, data: NightCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id); lookup = {day.id: day for day in trip.days}
    previous, following = lookup.get(data.previous_day_id), lookup.get(data.next_day_id)
    if previous is None or following is None or following.sort_order != previous.sort_order + 1: raise HTTPException(422, "A night must connect consecutive days of the same trip")
    values = data.model_dump(exclude={"previous_day_id", "next_day_id"})
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    night = TripNight(trip_id=trip.id, previous_day_id=previous.id, next_day_id=following.id, **values); session.add(night); stale(previous); stale(following); session.commit(); return NightRead.model_validate(night)


@router.patch("/trip-nights/{night_id}", response_model=NightRead)
def update_night(night_id: UUID, data: NightUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, access = require_night_role(session, night_id, user, "editor"); values = data.model_dump(exclude_unset=True)
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    for key, value in values.items(): setattr(night, key, value)
    stale(night.previous_day); stale(night.next_day); session.commit(); return NightRead.model_validate(night)


@router.delete("/trip-nights/{night_id}", status_code=204)
def remove_night(night_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "editor"); stale(night.previous_day); stale(night.next_day); session.delete(night); session.commit()


@router.post("/trips/{trip_id}/departure", response_model=DepartureRead, status_code=201)
def add_departure(trip_id: UUID, data: DepartureCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    if trip.departure is not None: raise HTTPException(409, "This trip already has a departure point")
    values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    departure = TripDeparture(trip_id=trip.id, **values); session.add(departure)
    if trip.days:
        stale(trip.days[0])
        stale(trip.days[-1])
    session.commit(); return DepartureRead.model_validate(departure)


@router.delete("/trip-departures/{departure_id}", status_code=204)
def remove_departure(departure_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    departure, access = require_departure_role(session, departure_id, user, "editor")
    trip = load_trip(session, access.trip.id)
    if trip.days:
        stale(trip.days[0])
        stale(trip.days[-1])
    session.delete(departure); session.commit()


@router.patch("/trip-departures/{departure_id}", response_model=DepartureRead)
def update_departure(departure_id: UUID, data: DepartureUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    departure, access = require_departure_role(session, departure_id, user, "editor")
    values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    for key, value in values.items(): setattr(departure, key, value)
    trip = load_trip(session, access.trip.id)
    if trip.days:
        stale(trip.days[0])
        stale(trip.days[-1])
    session.commit(); return DepartureRead.model_validate(departure)


@router.post("/trips/{trip_id}/arrival", response_model=ArrivalRead, status_code=201)
def add_arrival(trip_id: UUID, data: ArrivalCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    if trip.arrival is not None: raise HTTPException(409, "This trip already has an arrival point")
    values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    arrival = TripArrival(trip_id=trip.id, **values); session.add(arrival)
    if trip.days: stale(trip.days[-1])
    session.commit(); return ArrivalRead.model_validate(arrival)


@router.patch("/trip-arrivals/{arrival_id}", response_model=ArrivalRead)
def update_arrival(arrival_id: UUID, data: ArrivalUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    arrival, access = require_arrival_role(session, arrival_id, user, "editor"); values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    for key, value in values.items(): setattr(arrival, key, value)
    trip = load_trip(session, access.trip.id)
    if trip.days: stale(trip.days[-1])
    session.commit(); return ArrivalRead.model_validate(arrival)


@router.delete("/trip-arrivals/{arrival_id}", status_code=204)
def remove_arrival(arrival_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    arrival, access = require_arrival_role(session, arrival_id, user, "editor"); trip = load_trip(session, access.trip.id)
    if trip.days: stale(trip.days[-1])
    session.delete(arrival); session.commit()


@router.post("/trip-days/{day_id}/route", response_model=DayRead)
@router.post("/trip-days/{day_id}/route/recalculate", response_model=DayRead)
def route_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    _, access = require_day_role(session, day_id, user, "editor")
    trip = load_trip(session, access.trip.id)
    day = next(item for item in trip.days if item.id == day_id)
    return DayRead.model_validate(calculate_day_route(session, day, provider, trip.routing_profile, _routing_constraints(user)))


@router.post("/trip-days/{day_id}/optimize")
def optimize_day(day_id: UUID, options: OptimizeOptions, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    day, access = require_day_role(session, day_id, user, "editor"); stops = sorted(day.stops, key=lambda item: item.sort_order)
    if len(stops) < 2: raise HTTPException(422, "At least two stops are required for optimization")
    start = day.previous_night or (day.trip.departure if day.day_number == 1 else None)
    end = day.next_night or ((day.trip.arrival or day.trip.departure) if day.day_number == len(day.trip.days) else None)
    points = ([start] if start else []) + stops + ([end] if end else [])
    if provider.provider_id == "google":
        try:
            optimized_stops = _google_optimized_stops(provider, stops, start, end, options, access.trip.routing_profile)
            manual_route = provider.calculate_route([(point.longitude, point.latitude) for point in points], access.trip.routing_profile)
            optimized_points = ([start] if start else []) + optimized_stops + ([end] if end else [])
            optimized_route = provider.calculate_route([(point.longitude, point.latitude) for point in optimized_points], access.trip.routing_profile)
        except RoutingError as error:
            raise HTTPException(502, {"code": error.code, "message": str(error)}) from error
        return {
            "manual_stop_ids": [stop.id for stop in stops],
            "optimized_stop_ids": [stop.id for stop in optimized_stops],
            "before": manual_route.duration_seconds if options.metric == "duration" else manual_route.distance_meters,
            "after": optimized_route.duration_seconds if options.metric == "duration" else optimized_route.distance_meters,
            "gain": max(0, (manual_route.duration_seconds - optimized_route.duration_seconds) if options.metric == "duration" else (manual_route.distance_meters - optimized_route.distance_meters)),
            "metric": options.metric,
            "before_distance_meters": manual_route.distance_meters,
            "after_distance_meters": optimized_route.distance_meters,
            "distance_gain_meters": max(0, manual_route.distance_meters - optimized_route.distance_meters),
            "before_duration_seconds": manual_route.duration_seconds,
            "after_duration_seconds": optimized_route.duration_seconds,
            "duration_gain_seconds": max(0, manual_route.duration_seconds - optimized_route.duration_seconds),
        }
    try: matrix = provider.calculate_matrix([(point.longitude, point.latitude) for point in points], access.trip.routing_profile)
    except RoutingError as error: raise HTTPException(502, str(error)) from error
    values = matrix.durations if options.metric == "duration" else matrix.distances
    offset = 1 if start else 0
    locked = {index + offset for index, stop in enumerate(stops) if options.keep_locked and stop.is_locked}
    if start: locked.add(0)
    if end: locked.add(len(points) - 1)
    keep_start = bool(start) or options.keep_start
    keep_end = bool(end) or options.keep_end
    return_to_start = options.return_to_start and end is None
    order = optimize_matrix(values, locked, keep_start, keep_end, return_to_start)
    stop_indexes = [index for index in order if offset <= index < offset + len(stops)]
    manual_order = list(range(len(points)))
    before = path_cost(manual_order, values, return_to_start); after = path_cost(order, values, return_to_start)
    before_distance = path_cost(manual_order, matrix.distances, return_to_start)
    after_distance = path_cost(order, matrix.distances, return_to_start)
    before_duration = path_cost(manual_order, matrix.durations, return_to_start)
    after_duration = path_cost(order, matrix.durations, return_to_start)
    return {
        "manual_stop_ids": [stop.id for stop in stops],
        "optimized_stop_ids": [stops[index - offset].id for index in stop_indexes],
        "before": before,
        "after": after,
        "gain": max(0, before - after),
        "metric": options.metric,
        "before_distance_meters": before_distance,
        "after_distance_meters": after_distance,
        "distance_gain_meters": max(0, before_distance - after_distance),
        "before_duration_seconds": before_duration,
        "after_duration_seconds": after_duration,
        "duration_gain_seconds": max(0, before_duration - after_duration),
    }


def _google_optimized_stops(provider: RoutingProvider, stops: list[TripStop], start: object | None, end: object | None, options: OptimizeOptions, profile: str) -> list[TripStop]:
    """Optimize independent runs so locked CartaVault stops remain fixed."""
    result = list(stops)
    locked = {index for index, stop in enumerate(stops) if options.keep_locked and stop.is_locked}
    if options.keep_start and start is None:
        locked.add(0)
    if options.keep_end and end is None:
        locked.add(len(stops) - 1)
    cursor = 0
    while cursor < len(stops):
        if cursor in locked:
            cursor += 1
            continue
        finish = cursor
        while finish + 1 < len(stops) and finish + 1 not in locked:
            finish += 1
        run = result[cursor:finish + 1]
        left = start if cursor == 0 else result[cursor - 1]
        right = end if finish == len(stops) - 1 else result[finish + 1]
        coordinates = ([(left.longitude, left.latitude)] if left else []) + [(stop.longitude, stop.latitude) for stop in run] + ([(right.longitude, right.latitude)] if right else [])
        if len(run) > 1 and len(coordinates) > 2:
            order = provider.optimize_waypoint_order(coordinates, profile)
            movable = run
            if left is None:
                movable = run[1:]
                prefix = run[:1]
            else:
                prefix = []
            if right is None:
                movable = movable[:-1]
                suffix = run[-1:]
            else:
                suffix = []
            if len(order) != len(movable):
                raise RoutingError("Google Routes returned an invalid waypoint order", "GOOGLE_ROUTES_INVALID_RESPONSE")
            result[cursor:finish + 1] = prefix + [movable[index] for index in order] + suffix
        cursor = finish + 1
    return result


@router.post("/trip-days/{day_id}/optimize/confirm", response_model=DayRead)
def confirm_optimization(day_id: UUID, data: OptimizeConfirm, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    day, access = require_day_role(session, day_id, user, "editor")
    if set(data.stop_ids) != {item.id for item in day.stops} or len(data.stop_ids) != len(day.stops): raise HTTPException(422, "Optimized order must contain every stop exactly once")
    previous_order = {stop.id: stop.sort_order for stop in day.stops}
    previous_route_status = day.route_status
    for stop in day.stops: stop.sort_order += 10_000
    session.flush(); lookup = {stop.id: stop for stop in day.stops}
    for index, item in enumerate(data.stop_ids): lookup[item].sort_order = index
    stale(day)
    try:
        calculated = calculate_day_route(session, day, provider, access.trip.routing_profile, _routing_constraints(user))
    except CountryRouteError:
        # Keep the existing order and route if the final optimized geometry
        # crosses the national boundary.  The OSRM table alone is insufficient.
        for stop in day.stops:
            stop.sort_order = previous_order[stop.id]
        day.route_status = previous_route_status
        session.flush()
        raise
    calculated.stops.sort(key=lambda item: item.sort_order)
    return DayRead.model_validate(calculated)


@router.post("/trip-days/{day_id}/optimize/cancel", status_code=204)
def cancel_optimization(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_day_role(session, day_id, user, "editor")


@router.get("/trips/{trip_id}/summary", response_model=TripSummaryRead)
def trip_summary_endpoint(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user)
    trip = load_trip(session, trip_id)
    result = trip_summary(trip)
    constraints = _routing_constraints(user)
    if constraints.stay_in_country and trip.days:
        status = _day_constraint_summary(session, user, trip.days[0])
        result.update({key: status[key] for key in ("country_constraint_enabled", "constraint_country_code", "constraint_country_name")})
    else:
        result.update({"country_constraint_enabled": False, "constraint_country_code": None, "constraint_country_name": None})
    return result


@router.get("/trip-days/{day_id}/summary", response_model=DaySummaryRead)
def day_summary_endpoint(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "viewer")
    return {**day_summary(day), **_day_constraint_summary(session, user, day)}


@router.patch("/trip-stops/{stop_id}/visit-status", response_model=StopRead)
def visit_status(stop_id: UUID, data: StopUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if data.visit_status is None: raise HTTPException(422, "visit_status is required")
    return update_stop(stop_id, data, session, user)


@router.post("/trips/{trip_id}/apply-place-statuses")
def apply_place_statuses(trip_id: UUID, data: ApplyPlaceStatuses, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_owner(session, trip_id, user).trip.id); proposals = []
    for day in trip.days:
        for stop in day.stops:
            status_id = data.mappings.get(stop.visit_status)
            if stop.place_id and status_id:
                status = session.get(PlaceStatus, status_id)
                if status is None: raise HTTPException(422, "Unknown place status")
                proposals.append({"stop_id": stop.id, "place_id": stop.place_id, "visit_status": stop.visit_status, "status_id": status_id})
                if data.confirm: session.get(Place, stop.place_id).status_id = status_id
    if data.confirm: session.commit()
    return {"confirmed": data.confirm, "proposals": proposals}


@router.post("/trips/{trip_id}/exports/google-maps")
def export_google(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user); trip = load_trip(session, trip_id); _assert_export_routes(session, user, trip); links = google_maps_links(trip)
    warnings = ["Large days are split into several Google Maps links"] if len(links) > len(trip.days) else []
    if _routing_constraints(user).stay_in_country: warnings.append("Google Maps peut choisir un itinéraire différent et ne garantit pas le respect de cette contrainte.")
    return {"links": links, "warnings": warnings}


@router.post("/trips/{trip_id}/exports/gpx", status_code=201)
def export_gpx(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); trip = load_trip(session, trip_id); _assert_export_routes(session, user, trip); item = create_gpx(trip, user.id); return {"export_id": item.export_id, "file_name": item.file_name, "download_url": f"/trips/{trip_id}/exports/{item.export_id}/download", "expires_at": item.expires_at}


@router.post("/trips/{trip_id}/exports/kmz", status_code=201)
def export_kmz(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); trip = load_trip(session, trip_id); _assert_export_routes(session, user, trip); item = create_kmz(trip, user.id); return {"export_id": item.export_id, "file_name": item.file_name, "download_url": f"/trips/{trip_id}/exports/{item.export_id}/download", "expires_at": item.expires_at}


@router.get("/trips/{trip_id}/exports/{export_id}/download")
def download_trip_export(trip_id: UUID, export_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); item = get_export(export_id, access.trip.map_id, user.id)
    if item is None: raise HTTPException(404, "Trip export not found or expired")
    media = "application/gpx+xml" if item.file_name.endswith(".gpx") else "application/vnd.google-earth.kmz"
    return FileResponse(item.path, media_type=media, filename=item.file_name)
