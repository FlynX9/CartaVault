from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.database import get_db
from app.exports.temporary_exports import get as get_export
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.trips.export_service import create_gpx, create_kmz, google_maps_links
from app.trips.models import Trip, TripDay, TripDeparture, TripNight, TripStop
from app.trips.optimizer import optimize_matrix, path_cost
from app.trips.permissions import require_day_role, require_departure_role, require_night_role, require_stop_role, require_trip_editor, require_trip_owner, require_trip_viewer
from app.trips.routing import OsrmRoutingProvider
from app.trips.routing.base import RoutingError, RoutingProvider
from app.trips.schemas import ApplyPlaceStatuses, DayCreate, DayRead, DaySummaryRead, DayUpdate, DepartureCreate, DepartureRead, DepartureUpdate, IdOrder, NightCreate, NightRead, NightUpdate, OptimizeConfirm, OptimizeOptions, StopCreate, StopMove, StopRead, StopUpdate, TripCreate, TripRead, TripSummaryRead, TripUpdate
from app.trips.service import calculate_day_route, load_trip, normalize_day_order, place_snapshot, stale
from app.trips.summary_service import day_summary, trip_summary

router = APIRouter(tags=["trips"])


def get_routing_provider() -> RoutingProvider: return OsrmRoutingProvider()


def _trip_read(session: Session, trip_id: UUID) -> TripRead: return TripRead.model_validate(load_trip(session, trip_id))


@router.get("/maps/{map_id}/trips", response_model=list[TripRead])
def list_trips(map_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_map_role(session, map_id, user, "viewer")
    ids = session.scalars(select(Trip.id).where(Trip.map_id == map_id).order_by(Trip.archived_at.is_not(None), Trip.updated_at.desc())).all()
    return [_trip_read(session, item) for item in ids]


@router.post("/maps/{map_id}/trips", response_model=TripRead, status_code=201)
def create_trip(map_id: UUID, data: TripCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_map_role(session, map_id, user, "editor")
    trip = Trip(map_id=map_id, created_by_user_id=user.id, **data.model_dump()); session.add(trip); session.commit()
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


@router.delete("/trips/{trip_id}", status_code=204)
def remove_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_owner(session, trip_id, user).trip; session.delete(trip); session.commit()


@router.post("/trips/{trip_id}/archive", response_model=TripRead)
def archive_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip; trip.status = "archived"; trip.archived_at = datetime.now(UTC).replace(tzinfo=None); session.commit(); return _trip_read(session, trip_id)


@router.post("/trips/{trip_id}/duplicate", response_model=TripRead, status_code=201)
def duplicate_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    copy = Trip(map_id=source.map_id, created_by_user_id=user.id, name=f"{source.name} — copie", description=source.description, start_date=source.start_date, end_date=source.end_date, routing_profile=source.routing_profile)
    session.add(copy); session.flush(); days: dict[UUID, TripDay] = {}
    for item in source.days:
        day = TripDay(trip_id=copy.id, day_number=item.day_number, date=item.date, title=item.title, notes=item.notes, planned_start_time=item.planned_start_time, planned_end_time=item.planned_end_time, max_total_duration_minutes=item.max_total_duration_minutes, sort_order=item.sort_order)
        session.add(day); session.flush(); days[item.id] = day
        for stop in item.stops: session.add(TripStop(trip_day_id=day.id, place_id=stop.place_id, stop_type=stop.stop_type, name=stop.name, latitude=stop.latitude, longitude=stop.longitude, address=stop.address, sort_order=stop.sort_order, visit_duration_minutes=stop.visit_duration_minutes, notes=stop.notes, is_required=stop.is_required, is_locked=stop.is_locked, visit_status="planned"))
    for night in source.nights: session.add(TripNight(trip_id=copy.id, previous_day_id=days[night.previous_day_id].id, next_day_id=days[night.next_day_id].id, place_id=night.place_id, name=night.name, latitude=night.latitude, longitude=night.longitude, address=night.address, notes=night.notes, check_in_time=night.check_in_time, check_out_time=night.check_out_time))
    if source.departure: session.add(TripDeparture(trip_id=copy.id, place_id=source.departure.place_id, name=source.departure.name, latitude=source.departure.latitude, longitude=source.departure.longitude, address=source.departure.address, notes=source.departure.notes, departure_time=source.departure.departure_time))
    session.commit(); return _trip_read(session, copy.id)


@router.post("/trips/{trip_id}/days", response_model=DayRead, status_code=201)
def add_day(trip_id: UUID, data: DayCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id); index = len(trip.days)
    day = TripDay(trip_id=trip.id, day_number=index + 1, sort_order=index, **data.model_dump()); session.add(day); session.commit(); return DayRead.model_validate(day)


@router.patch("/trip-days/{day_id}", response_model=DayRead)
def update_day(day_id: UUID, data: DayUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "editor")
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(day, key, value)
    session.commit(); return DayRead.model_validate(day)


@router.delete("/trip-days/{day_id}", status_code=204)
def remove_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, access = require_day_role(session, day_id, user, "editor"); trip_id = day.trip_id; session.delete(day); session.flush(); normalize_day_order(load_trip(session, trip_id)); session.commit()


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
    copy = TripDay(trip_id=trip.id, day_number=insertion + 1, sort_order=insertion, date=source.date, title=f"{source.title or f'Jour {source.day_number}'} — copie", notes=source.notes, planned_start_time=source.planned_start_time, planned_end_time=source.planned_end_time, max_total_duration_minutes=source.max_total_duration_minutes)
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
    for key, value in data.model_dump(exclude_unset=True).items(): setattr(stop, key, value)
    stale(stop.day); session.commit(); return StopRead.model_validate(stop)


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
    if trip.days: stale(trip.days[0])
    session.commit(); return DepartureRead.model_validate(departure)


@router.delete("/trip-departures/{departure_id}", status_code=204)
def remove_departure(departure_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    departure, access = require_departure_role(session, departure_id, user, "editor")
    trip = load_trip(session, access.trip.id)
    if trip.days: stale(trip.days[0])
    session.delete(departure); session.commit()


@router.patch("/trip-departures/{departure_id}", response_model=DepartureRead)
def update_departure(departure_id: UUID, data: DepartureUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    departure, access = require_departure_role(session, departure_id, user, "editor")
    values = data.model_dump()
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude)
    for key, value in values.items(): setattr(departure, key, value)
    trip = load_trip(session, access.trip.id)
    if trip.days: stale(trip.days[0])
    session.commit(); return DepartureRead.model_validate(departure)


@router.post("/trip-days/{day_id}/route", response_model=DayRead)
@router.post("/trip-days/{day_id}/route/recalculate", response_model=DayRead)
def route_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    day, access = require_day_role(session, day_id, user, "editor"); return DayRead.model_validate(calculate_day_route(session, day, provider, access.trip.routing_profile))


@router.post("/trip-days/{day_id}/optimize")
def optimize_day(day_id: UUID, options: OptimizeOptions, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    day, access = require_day_role(session, day_id, user, "editor"); stops = sorted(day.stops, key=lambda item: item.sort_order)
    if len(stops) < 2: raise HTTPException(422, "At least two stops are required for optimization")
    start = day.previous_night or (day.trip.departure if day.day_number == 1 else None)
    end = day.next_night
    points = ([start] if start else []) + stops + ([end] if end else [])
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
    before = path_cost(list(range(len(points))), values, return_to_start); after = path_cost(order, values, return_to_start)
    return {"manual_stop_ids": [stop.id for stop in stops], "optimized_stop_ids": [stops[index - offset].id for index in stop_indexes], "before": before, "after": after, "gain": max(0, before - after), "metric": options.metric}


@router.post("/trip-days/{day_id}/optimize/confirm", response_model=DayRead)
def confirm_optimization(day_id: UUID, data: OptimizeConfirm, session: Session = Depends(get_db), user: User = Depends(get_current_user), provider: RoutingProvider = Depends(get_routing_provider)):
    day, access = require_day_role(session, day_id, user, "editor")
    if set(data.stop_ids) != {item.id for item in day.stops} or len(data.stop_ids) != len(day.stops): raise HTTPException(422, "Optimized order must contain every stop exactly once")
    for stop in day.stops: stop.sort_order += 10_000
    session.flush(); lookup = {stop.id: stop for stop in day.stops}
    for index, item in enumerate(data.stop_ids): lookup[item].sort_order = index
    stale(day)
    calculated = calculate_day_route(session, day, provider, access.trip.routing_profile)
    calculated.stops.sort(key=lambda item: item.sort_order)
    return DayRead.model_validate(calculated)


@router.post("/trip-days/{day_id}/optimize/cancel", status_code=204)
def cancel_optimization(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_day_role(session, day_id, user, "editor")


@router.get("/trips/{trip_id}/summary", response_model=TripSummaryRead)
def trip_summary_endpoint(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user); return trip_summary(load_trip(session, trip_id))


@router.get("/trip-days/{day_id}/summary", response_model=DaySummaryRead)
def day_summary_endpoint(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, _ = require_day_role(session, day_id, user, "viewer"); return day_summary(day)


@router.post("/trips/{trip_id}/start", response_model=TripRead)
def start_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip; trip.status = "in_progress"; session.commit(); return _trip_read(session, trip_id)


@router.post("/trips/{trip_id}/complete", response_model=TripRead)
def complete_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip; trip.status = "completed"; trip.completed_at = datetime.now(UTC).replace(tzinfo=None); session.commit(); return _trip_read(session, trip_id)


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
    require_trip_viewer(session, trip_id, user); links = google_maps_links(load_trip(session, trip_id)); return {"links": links, "warnings": ["Large days are split into several Google Maps links"] if len(links) > len(load_trip(session, trip_id).days) else []}


@router.post("/trips/{trip_id}/exports/gpx", status_code=201)
def export_gpx(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); item = create_gpx(load_trip(session, trip_id), user.id); return {"export_id": item.export_id, "file_name": item.file_name, "download_url": f"/trips/{trip_id}/exports/{item.export_id}/download", "expires_at": item.expires_at}


@router.post("/trips/{trip_id}/exports/kmz", status_code=201)
def export_kmz(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); item = create_kmz(load_trip(session, trip_id), user.id); return {"export_id": item.export_id, "file_name": item.file_name, "download_url": f"/trips/{trip_id}/exports/{item.export_id}/download", "expires_at": item.expires_at}


@router.get("/trips/{trip_id}/exports/{export_id}/download")
def download_trip_export(trip_id: UUID, export_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); item = get_export(export_id, access.trip.map_id, user.id)
    if item is None: raise HTTPException(404, "Trip export not found or expired")
    media = "application/gpx+xml" if item.file_name.endswith(".gpx") else "application/vnd.google-earth.kmz"
    return FileResponse(item.path, media_type=media, filename=item.file_name)
