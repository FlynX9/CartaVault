from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
from app.photos.storage import PhotoFileNotFoundError, PhotoStorageError, PhotoTooLargeError, UnsupportedPhotoTypeError, delete_photo_file, resolve_photo_file, store_photo_file
from app.statuses.models import PlaceStatus
from app.trips.export_service import create_gpx, create_kmz, google_maps_links
from app.trips.pdf_export import create_pdf
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop
from app.trips.optimizer import optimize_matrix, path_cost
from app.trips.permissions import require_arrival_role, require_day_role, require_departure_role, require_night_role, require_stop_role, require_trip_editor, require_trip_owner, require_trip_viewer
from app.trips.routing.registry import routing_preferences, routing_provider_registry
from app.trips.routing.base import RoutingConstraints, RoutingError, RoutingProvider
from app.trips.schemas import ApplyPlaceStatuses, ArrivalCreate, ArrivalRead, ArrivalUpdate, DayCreate, DayRead, DaySummaryRead, DayUpdate, DepartureCreate, DepartureRead, DepartureUpdate, IdOrder, NightCreate, NightRead, NightUpdate, OptimizeConfirm, OptimizeOptions, StopCreate, StopMove, StopRead, StopUpdate, TripCreate, TripDayTimingUpdate, TripLoadSettings, TripPdfExportOptions, TripRead, TripSummaryRead, TripUpdate
from app.trips.service import CountryRouteError, DAY_COLOR_PALETTE, calculate_day_route, load_trip, next_day_color, normalize_day_order, place_snapshot, previous_day_last_stop, stale, resolve_constraint_country, synchronize_trip_dates
from app.trips.routing.country_validator import CountryRouteValidator
from app.trips.summary_service import day_summary, trip_summary
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.trash.service import trash_deadline

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
    ids = session.scalars(select(Trip.id).where(Trip.map_id == map_id, Trip.deleted_at.is_(None)).order_by(Trip.archived_at.is_not(None), Trip.updated_at.desc())).all()
    return [_trip_read(session, item) for item in ids]


@router.post("/maps/{map_id}/trips", response_model=TripRead, status_code=201)
def create_trip(map_id: UUID, data: TripCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_map_role(session, map_id, user, "editor")
    quotas = QuotaService(session)
    quotas.ensure_can_create(user.id, QuotaKey.TRIPS_PER_MAP_MAX, scope_id=map_id)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.TRIPS_TOTAL_MAX)
    trip = Trip(map_id=map_id, created_by_user_id=user.id, **data.model_dump()); session.add(trip); session.flush()
    quotas.ensure_can_create(user.id, QuotaKey.DAYS_PER_TRIP_MAX, scope_id=trip.id)
    session.add(TripDay(trip_id=trip.id, day_number=1, sort_order=0, color=DAY_COLOR_PALETTE[0])); session.flush(); synchronize_trip_dates(trip); session.commit()
    return _trip_read(session, trip.id)


@router.get("/trips/{trip_id}", response_model=TripRead)
def read_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user); return _trip_read(session, trip_id)


@router.put("/trips/{trip_id}/state", response_model=TripRead)
def restore_trip_state(trip_id: UUID, data: TripRead, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Atomically restore a previously read trip state for undo/redo."""
    access = require_trip_editor(session, trip_id, user)
    trip = load_trip(session, access.trip.id)
    if data.id != trip.id or data.map_id != trip.map_id or data.created_by_user_id != trip.created_by_user_id:
        raise HTTPException(422, "A restored state must belong to the same trip")
    if not data.days:
        raise HTTPException(422, "A trip must keep at least one day")

    day_ids = [day.id for day in data.days]
    if len(day_ids) != len(set(day_ids)):
        raise HTTPException(422, "Restored days must be unique")
    expected_orders = list(range(len(data.days)))
    if sorted(day.sort_order for day in data.days) != expected_orders:
        raise HTTPException(422, "Restored day order must be contiguous")
    day_id_set = set(day_ids)
    for day in data.days:
        if day.trip_id != trip.id or any(stop.trip_day_id != day.id for stop in day.stops):
            raise HTTPException(422, "Restored steps must belong to their day")
        if sorted(stop.sort_order for stop in day.stops) != list(range(len(day.stops))):
            raise HTTPException(422, "Restored step order must be contiguous")
    for night in data.nights:
        if night.trip_id != trip.id or night.previous_day_id not in day_id_set or night.next_day_id not in day_id_set:
            raise HTTPException(422, "Restored nights must connect restored days")

    profile = QuotaService(session).effective_profile(access.map_access.map.owner_id)
    if profile.days_per_trip_max is not None and len(data.days) > profile.days_per_trip_max:
        raise HTTPException(409, "The restored trip exceeds the day quota")
    if profile.steps_per_day_max is not None and any(len(day.stops) > profile.steps_per_day_max for day in data.days):
        raise HTTPException(409, "The restored trip exceeds the step quota")

    place_ids = {
        place_id
        for place_id in [
            *(stop.place_id for day in data.days for stop in day.stops),
            *(night.place_id for night in data.nights),
            data.departure.place_id if data.departure else None,
            data.arrival.place_id if data.arrival else None,
        ]
        if place_id is not None
    }
    valid_place_ids = set(session.scalars(select(Place.id).where(Place.map_id == trip.map_id, Place.id.in_(place_ids)))) if place_ids else set()
    if valid_place_ids != place_ids:
        raise HTTPException(422, "A restored place must belong to the trip map")

    restored_night_ids = {night.id for night in data.nights}
    preserved_night_photos = [
        {
            "id": photo.id,
            "night_id": night.id,
            "file_path": photo.file_path,
            "mime_type": photo.mime_type,
            "sort_order": photo.sort_order,
            "created_at": photo.created_at,
        }
        for night in trip.nights if night.id in restored_night_ids
        for photo in night.photos
    ]
    current_day_ids = select(TripDay.id).where(TripDay.trip_id == trip.id)
    session.execute(delete(TripNight).where(TripNight.trip_id == trip.id))
    session.execute(delete(TripStop).where(TripStop.trip_day_id.in_(current_day_ids)))
    session.execute(delete(TripDeparture).where(TripDeparture.trip_id == trip.id))
    session.execute(delete(TripArrival).where(TripArrival.trip_id == trip.id))
    session.execute(delete(TripDay).where(TripDay.trip_id == trip.id))
    session.flush()

    for field in (
        "name", "description", "start_date", "end_date", "status", "routing_profile",
        "low_load_max_minutes", "medium_load_max_minutes", "low_load_color",
        "medium_load_color", "high_load_color", "completed_at", "archived_at",
    ):
        setattr(trip, field, getattr(data, field))

    for day_data in data.days:
        values = day_data.model_dump(exclude={"stops", "trip_id"})
        session.add(TripDay(trip_id=trip.id, **values))
    session.flush()
    for day_data in data.days:
        for stop_data in day_data.stops:
            values = stop_data.model_dump(exclude={"trip_day_id"})
            session.add(TripStop(trip_day_id=day_data.id, **values))
    for night_data in data.nights:
        values = night_data.model_dump(exclude={"trip_id", "photo_id", "photos"})
        session.add(TripNight(trip_id=trip.id, **values))
    session.flush()
    if preserved_night_photos:
        session.execute(TripNightPhoto.__table__.insert(), preserved_night_photos)
    if data.departure:
        session.add(TripDeparture(trip_id=trip.id, **data.departure.model_dump(exclude={"trip_id"})))
    if data.arrival:
        session.add(TripArrival(trip_id=trip.id, **data.arrival.model_dump(exclude={"trip_id"})))
    session.commit()
    session.expire_all()
    return _trip_read(session, trip.id)


@router.patch("/trips/{trip_id}", response_model=TripRead)
def update_trip(trip_id: UUID, data: TripUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_editor(session, trip_id, user)
    # Load the days before changing the dates. Loading them afterwards triggers
    # an autoflush where the new start date is still paired with the old derived
    # end date, which can violate the database date constraint.
    trip = load_trip(session, trip_id)
    values = data.model_dump(exclude_unset=True)
    values.pop("end_date", None)
    for key, value in values.items(): setattr(trip, key, value)
    synchronize_trip_dates(trip)
    session.commit(); return _trip_read(session, trip_id)


@router.patch("/trips/{trip_id}/load-settings", response_model=TripRead)
def update_trip_load_settings(trip_id: UUID, data: TripLoadSettings, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip
    for key, value in data.model_dump().items(): setattr(trip, key, value)
    session.commit(); return _trip_read(session, trip_id)


@router.delete("/trips/{trip_id}", status_code=204)
def remove_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_owner(session, trip_id, user).trip
    trip.deleted_at, trip.purge_after = trash_deadline(user)
    trip.deleted_by_user_id = user.id
    session.commit()


@router.post("/trips/{trip_id}/archive", response_model=TripRead)
def archive_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip
    trip.status = "completed"
    trip.completed_at = datetime.now(UTC).replace(tzinfo=None)
    trip.archived_at = None
    session.commit()
    return _trip_read(session, trip_id)


@router.post("/trips/{trip_id}/unarchive", response_model=TripRead)
def unarchive_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = require_trip_editor(session, trip_id, user).trip
    trip.status = "in_progress"
    trip.completed_at = None
    trip.archived_at = None
    session.commit()
    return _trip_read(session, trip_id)


@router.post("/trips/{trip_id}/duplicate", response_model=TripRead, status_code=201)
def duplicate_trip(trip_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    quotas = QuotaService(session)
    quotas.ensure_can_create(user.id, QuotaKey.TRIPS_PER_MAP_MAX, scope_id=source.map_id)
    owner_id = session.scalar(select(PoiMap.owner_id).where(PoiMap.id == source.map_id))
    if owner_id is None:
        raise HTTPException(404, "Map not found")
    quotas.ensure_can_create(owner_id, QuotaKey.TRIPS_TOTAL_MAX)
    copy = Trip(map_id=source.map_id, created_by_user_id=user.id, name=f"{source.name} — copie", description=source.description, start_date=source.start_date, end_date=source.end_date, routing_profile=source.routing_profile, low_load_max_minutes=source.low_load_max_minutes, medium_load_max_minutes=source.medium_load_max_minutes, low_load_color=source.low_load_color, medium_load_color=source.medium_load_color, high_load_color=source.high_load_color)
    session.add(copy); session.flush(); days: dict[UUID, TripDay] = {}
    quotas.ensure_can_create(user.id, QuotaKey.DAYS_PER_TRIP_MAX, scope_id=copy.id, increment=len(source.days))
    for item in source.days:
        day = TripDay(trip_id=copy.id, day_number=item.day_number, date=item.date, title=item.title, color=item.color, notes=item.notes, planned_start_time=item.planned_start_time, planned_end_time=item.planned_end_time, target_arrival_time=item.target_arrival_time, default_stop_buffer_minutes=item.default_stop_buffer_minutes, safety_margin_type=item.safety_margin_type, safety_margin_value=item.safety_margin_value, max_total_duration_minutes=item.max_total_duration_minutes, sort_order=item.sort_order)
        session.add(day); session.flush(); days[item.id] = day
        quotas.ensure_can_create(user.id, QuotaKey.STEPS_PER_DAY_MAX, scope_id=day.id, increment=len(item.stops))
        for stop in item.stops: session.add(TripStop(trip_day_id=day.id, place_id=stop.place_id, stop_type=stop.stop_type, name=stop.name, latitude=stop.latitude, longitude=stop.longitude, address=stop.address, sort_order=stop.sort_order, visit_duration_minutes=stop.visit_duration_minutes, notes=stop.notes, is_required=stop.is_required, is_locked=stop.is_locked, visit_status="planned"))
    for night in source.nights: session.add(TripNight(trip_id=copy.id, previous_day_id=days[night.previous_day_id].id, next_day_id=days[night.next_day_id].id, place_id=night.place_id, source_type=night.source_type, name=night.name, latitude=night.latitude, longitude=night.longitude, address=night.address, google_place_id=night.google_place_id, website_url=night.website_url, description=night.description, notes=night.notes, check_in_from_time=night.check_in_from_time, check_in_until_time=night.check_in_until_time, check_out_from_time=night.check_out_from_time, check_out_until_time=night.check_out_until_time))
    if source.departure: session.add(TripDeparture(trip_id=copy.id, place_id=source.departure.place_id, name=source.departure.name, latitude=source.departure.latitude, longitude=source.departure.longitude, address=source.departure.address, notes=source.departure.notes, departure_time=source.departure.departure_time))
    if source.arrival: session.add(TripArrival(trip_id=copy.id, place_id=source.arrival.place_id, name=source.arrival.name, latitude=source.arrival.latitude, longitude=source.arrival.longitude, address=source.arrival.address, notes=source.arrival.notes))
    synchronize_trip_dates(load_trip(session, copy.id))
    session.commit(); return _trip_read(session, copy.id)


@router.post("/trips/{trip_id}/days", response_model=DayRead, status_code=201)
def add_day(trip_id: UUID, data: DayCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id); ordered = sorted(trip.days, key=lambda item: item.sort_order)
    QuotaService(session).ensure_can_create(user.id, QuotaKey.DAYS_PER_TRIP_MAX, scope_id=trip.id)
    if data.after_day_id is None:
        insertion = len(ordered); previous = ordered[-1] if ordered else None
    else:
        previous = next((item for item in ordered if item.id == data.after_day_id), None)
        if previous is None: raise HTTPException(422, "The insertion day must belong to the trip")
        insertion = ordered.index(previous) + 1
    for item in ordered: item.sort_order += 10_000; item.day_number += 10_000
    session.flush()
    for index, item in enumerate(ordered): item.sort_order = index if index < insertion else index + 1; item.day_number = item.sort_order + 1
    values = data.model_dump(exclude={"after_day_id", "color"})
    day = TripDay(trip_id=trip.id, day_number=insertion + 1, sort_order=insertion, color=data.color or next_day_color(trip.days), **values); session.add(day); session.flush()
    if previous is not None and previous.next_night is not None: previous.next_night.previous_day = day
    synchronize_trip_dates(load_trip(session, trip.id))
    session.commit(); return DayRead.model_validate(day)


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
    loaded_trip = load_trip(session, trip_id)
    normalize_day_order(loaded_trip)
    synchronize_trip_dates(loaded_trip)
    session.commit()


@router.post("/trips/{trip_id}/days/reorder", response_model=TripRead)
def reorder_days(trip_id: UUID, data: IdOrder, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    trip = load_trip(session, require_trip_editor(session, trip_id, user).trip.id)
    if set(data.ids) != {day.id for day in trip.days} or len(data.ids) != len(trip.days): raise HTTPException(422, "Day order must contain every day exactly once")
    nights = session.scalars(select(TripNight).where(TripNight.trip_id == trip.id)).all()
    nights_by_previous_day = {
        night.previous_day_id: {column.name: getattr(night, column.name) for column in TripNight.__table__.columns}
        for night in nights
    }
    # A night travels with the day it follows. Rebuild the links atomically so
    # each retained night targets the day's new successor; the new last day
    # cannot keep an overnight stop before the arrival anchor.
    if nights:
        session.execute(delete(TripNight).where(TripNight.trip_id == trip.id))
        session.flush()
    for day in trip.days: day.sort_order += 10_000; day.day_number += 10_000
    session.flush(); lookup = {day.id: day for day in trip.days}
    for index, item in enumerate(data.ids): lookup[item].sort_order = index; lookup[item].day_number = index + 1
    rebuilt_nights = []
    for index, day_id in enumerate(data.ids[:-1]):
        values = nights_by_previous_day.get(day_id)
        if values is None: continue
        values["next_day_id"] = data.ids[index + 1]
        values["updated_at"] = datetime.now(UTC)
        rebuilt_nights.append(values)
    if rebuilt_nights: session.execute(TripNight.__table__.insert(), rebuilt_nights)
    for day in trip.days: stale(day)
    synchronize_trip_dates(trip)
    session.commit(); session.expire_all(); return _trip_read(session, trip_id)


@router.post("/trip-days/{day_id}/duplicate", response_model=DayRead, status_code=201)
def duplicate_day(day_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source, _ = require_day_role(session, day_id, user, "editor"); trip = load_trip(session, source.trip_id)
    quotas = QuotaService(session)
    quotas.ensure_can_create(user.id, QuotaKey.DAYS_PER_TRIP_MAX, scope_id=trip.id)
    for day in trip.days: day.sort_order += 10_000; day.day_number += 10_000
    session.flush(); ordered = sorted(trip.days, key=lambda item: item.sort_order); insertion = ordered.index(source) + 1
    for index, item in enumerate(ordered): item.sort_order = index if index < insertion else index + 1; item.day_number = item.sort_order + 1
    copy = TripDay(trip_id=trip.id, day_number=insertion + 1, sort_order=insertion, date=source.date, title=f"{source.title or f'Jour {source.day_number}'} — copie", color=next_day_color(trip.days), notes=source.notes, planned_start_time=source.planned_start_time, planned_end_time=source.planned_end_time, target_arrival_time=source.target_arrival_time, default_stop_buffer_minutes=source.default_stop_buffer_minutes, safety_margin_type=source.safety_margin_type, safety_margin_value=source.safety_margin_value, max_total_duration_minutes=source.max_total_duration_minutes)
    session.add(copy); session.flush()
    quotas.ensure_can_create(user.id, QuotaKey.STEPS_PER_DAY_MAX, scope_id=copy.id, increment=len(source.stops))
    if source.next_night is not None: source.next_night.previous_day = copy
    for stop in source.stops: session.add(TripStop(trip_day_id=copy.id, place_id=stop.place_id, stop_type=stop.stop_type, name=stop.name, latitude=stop.latitude, longitude=stop.longitude, address=stop.address, sort_order=stop.sort_order, visit_duration_minutes=stop.visit_duration_minutes, notes=stop.notes, is_required=stop.is_required, is_locked=stop.is_locked))
    synchronize_trip_dates(load_trip(session, trip.id))
    session.commit(); return DayRead.model_validate(copy)


@router.post("/trip-days/{day_id}/stops", response_model=StopRead, status_code=201)
def add_stop(day_id: UUID, data: StopCreate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    day, access = require_day_role(session, day_id, user, "editor"); values = data.model_dump()
    QuotaService(session).ensure_can_create(user.id, QuotaKey.STEPS_PER_DAY_MAX, scope_id=day_id)
    place = None
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude, stop_type="place")
    if "visit_duration_minutes" not in data.model_fields_set:
        values["visit_duration_minutes"] = place.default_visit_duration_minutes if place is not None and place.default_visit_duration_minutes is not None else 30
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
        place, latitude, longitude = place_snapshot(session, data.place_id, trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude, source_type="place", google_place_id=None)
    night = TripNight(trip_id=trip.id, previous_day_id=previous.id, next_day_id=following.id, **values); session.add(night); stale(previous); stale(following); session.commit(); return NightRead.model_validate(night)


@router.patch("/trip-nights/{night_id}", response_model=NightRead)
def update_night(night_id: UUID, data: NightUpdate, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, access = require_night_role(session, night_id, user, "editor"); values = data.model_dump(exclude_unset=True)
    if data.place_id:
        place, latitude, longitude = place_snapshot(session, data.place_id, access.trip.map_id); values.update(name=place.name, latitude=latitude, longitude=longitude, source_type="place", google_place_id=None)
    for key, value in values.items(): setattr(night, key, value)
    stale(night.previous_day); stale(night.next_day); session.commit(); return NightRead.model_validate(night)


@router.post("/trip-nights/{night_id}/photo", response_model=NightRead)
@router.post("/trip-nights/{night_id}/photos", response_model=NightRead)
def upload_night_photo(night_id: UUID, file: UploadFile = File(...), session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "editor")
    photo_id = uuid4()
    try:
        stored = store_photo_file(file.file, file.content_type, night.id, photo_id)
    except PhotoTooLargeError as error:
        raise HTTPException(413, str(error)) from error
    except UnsupportedPhotoTypeError as error:
        raise HTTPException(415, str(error)) from error
    except PhotoStorageError as error:
        raise HTTPException(500, str(error)) from error

    night.photos.append(TripNightPhoto(id=photo_id, file_path=stored.relative_path, mime_type=stored.media_type, sort_order=len(night.photos)))
    try:
        session.commit()
        session.refresh(night)
    except Exception:
        session.rollback()
        delete_photo_file(stored.relative_path, night.id, photo_id)
        raise
    return NightRead.model_validate(night)


@router.get("/trip-nights/{night_id}/photo")
def get_primary_night_photo(night_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "viewer")
    if not night.photos:
        raise HTTPException(404, "This night has no photo")
    return _night_photo_response(night, night.photos[0])


@router.get("/trip-nights/{night_id}/photos/{photo_id}")
def get_night_photo(night_id: UUID, photo_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "viewer")
    photo = session.get(TripNightPhoto, photo_id)
    if photo is None or photo.night_id != night.id:
        raise HTTPException(404, "Night photo not found")
    return _night_photo_response(night, photo)


def _night_photo_response(night: TripNight, photo: TripNightPhoto):
    try:
        path = resolve_photo_file(photo.file_path, night.id, photo.id, require_file=True)
    except PhotoFileNotFoundError as error:
        raise HTTPException(404, str(error)) from error
    except PhotoStorageError as error:
        raise HTTPException(500, str(error)) from error
    return FileResponse(path, media_type=photo.mime_type)


@router.delete("/trip-nights/{night_id}/photo", response_model=NightRead)
def remove_primary_night_photo(night_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "editor")
    if not night.photos:
        raise HTTPException(404, "This night has no photo")
    return _remove_night_photo(session, night, night.photos[0])


@router.delete("/trip-nights/{night_id}/photos/{photo_id}", response_model=NightRead)
def remove_night_photo(night_id: UUID, photo_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "editor")
    photo = session.get(TripNightPhoto, photo_id)
    if photo is None or photo.night_id != night.id:
        raise HTTPException(404, "Night photo not found")
    return _remove_night_photo(session, night, photo)


def _remove_night_photo(session: Session, night: TripNight, photo: TripNightPhoto) -> NightRead:
    path, photo_id = photo.file_path, photo.id
    removed_order = photo.sort_order
    session.delete(photo)
    session.flush()
    for sibling in night.photos:
        if sibling.id != photo.id and sibling.sort_order > removed_order:
            sibling.sort_order -= 1
    session.commit()
    try:
        delete_photo_file(path, night.id, photo_id)
    except PhotoStorageError:
        pass
    return NightRead.model_validate(night)


@router.delete("/trip-nights/{night_id}", status_code=204)
def remove_night(night_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    night, _ = require_night_role(session, night_id, user, "editor")
    photos = [(photo.file_path, photo.id) for photo in night.photos]
    stale(night.previous_day); stale(night.next_day); session.delete(night); session.commit()
    for path, photo_id in photos:
        try:
            delete_photo_file(path, night_id, photo_id)
        except PhotoStorageError:
            pass


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
    start = day.previous_night or (day.trip.departure if day.day_number == 1 else previous_day_last_stop(day))
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
                if status is None or status.map_id != trip.map_id: raise HTTPException(422, "Unknown place status")
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


@router.post("/trips/{trip_id}/exports/pdf", status_code=201)
def export_pdf(trip_id: UUID, options: TripPdfExportOptions, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_trip_viewer(session, trip_id, user)
    trip = load_trip(session, trip_id)
    _assert_export_routes(session, user, trip)
    locale = str((user.preferences or {}).get("language") or "fr")
    item = create_pdf(session, trip, user.id, locale, options)
    return {"export_id": item.export_id, "file_name": item.file_name, "download_url": f"/trips/{trip_id}/exports/{item.export_id}/download", "expires_at": item.expires_at}


@router.get("/trips/{trip_id}/exports/{export_id}/download")
def download_trip_export(trip_id: UUID, export_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)):
    access = require_trip_viewer(session, trip_id, user); item = get_export(export_id, access.trip.map_id, user.id)
    if item is None: raise HTTPException(404, "Trip export not found or expired")
    media = "application/pdf" if item.file_name.endswith(".pdf") else "application/gpx+xml" if item.file_name.endswith(".gpx") else "application/vnd.google-earth.kmz"
    return FileResponse(item.path, media_type=media, filename=item.file_name)
