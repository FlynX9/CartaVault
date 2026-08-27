from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.countries.models import Country
from app.maps.models import PoiMap
from app.places.models import Place
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop
from app.trips.routing.base import RouteResult, RoutingConstraints, RoutingError, RoutingProvider
from app.trips.routing.country_validator import CountryRouteValidation, CountryRouteValidator
from app.trips.summary_service import day_summary


DAY_COLOR_PALETTE = ("#0FA68A", "#2563EB", "#9333EA", "#D97706", "#DC2626", "#0891B2", "#65A30D", "#DB2777")
# Trips whose structural coordinate snapshots follow the canonical Place.
# completed/archived trips keep their frozen historical snapshots (AUD-011).
MUTABLE_TRIP_STATUSES = ("draft", "planned", "in_progress")


@dataclass(frozen=True)
class PhotoCleanupTarget:
    file_path: str
    night_id: UUID
    photo_id: UUID


@dataclass(frozen=True)
class TripResizePlan:
    target_day_count: int
    removed_days: tuple[TripDay, ...]
    removed_stops: tuple[TripStop, ...]
    affected_nights: tuple[TripNight, ...]
    affected_photos: tuple[TripNightPhoto, ...]
    removed_route_days: tuple[TripDay, ...]
    retained_last_day: TripDay | None
    invalidated_retained_route_days: tuple[TripDay, ...]

    @property
    def destructive(self) -> bool:
        return bool(self.affected_nights or any(day_has_significant_content(day) for day in self.removed_days))


def day_has_significant_content(day: TripDay) -> bool:
    """Only persistent user planning data makes an otherwise blank day destructive."""
    return bool(
        day.stops
        or day.title is not None
        or day.notes is not None
        or day.planned_start_time is not None
        or day.planned_end_time is not None
        or day.target_arrival_time is not None
        or day.default_stop_buffer_minutes != 0
        or day.safety_margin_type != "fixed"
        or day.safety_margin_value != 0
        or day.max_total_duration_minutes is not None
        or day.route_distance_meters is not None
        or day.route_duration_seconds is not None
        or day.visit_duration_minutes is not None
        or day.total_duration_minutes is not None
        or day.route_geometry is not None
        or day.route_segments is not None
        or day.route_status is not None
        or day.route_provider is not None
    )


def _has_persisted_route(day: TripDay) -> bool:
    return any(
        value is not None
        for value in (
            day.route_distance_meters,
            day.route_duration_seconds,
            day.route_geometry,
            day.route_segments,
            day.route_status,
            day.route_provider,
        )
    )


def analyze_trip_resize(trip: Trip, day_count: int) -> TripResizePlan:
    """Describe a trailing-day resize without changing the ORM graph.

    Day colour alone is deliberately not significant: CartaVault cannot tell an
    automatically assigned colour from a user-selected one.
    """
    if day_count < 1:
        raise HTTPException(422, "A trip must keep at least one day")
    ordered_days = tuple(sorted(trip.days, key=lambda item: item.sort_order))
    removed_days = ordered_days[day_count:]
    removed_ids = {day.id for day in removed_days}
    affected_nights = tuple(sorted(
        (night for night in trip.nights if night.previous_day_id in removed_ids or night.next_day_id in removed_ids),
        key=lambda night: (night.previous_day_id, night.next_day_id, night.id),
    ))
    affected_photos = tuple(photo for night in affected_nights for photo in night.photos)
    removed_stops = tuple(stop for day in removed_days for stop in day.stops)
    removed_route_days = tuple(day for day in removed_days if _has_persisted_route(day))
    retained_last_day = ordered_days[day_count - 1] if day_count < len(ordered_days) else None
    boundary_removed = retained_last_day is not None and any(
        night.previous_day_id == retained_last_day.id for night in affected_nights
    )
    invalidated = (
        (retained_last_day,)
        if boundary_removed and retained_last_day.route_status == "ready"
        else ()
    )
    return TripResizePlan(
        target_day_count=day_count,
        removed_days=removed_days,
        removed_stops=removed_stops,
        affected_nights=affected_nights,
        affected_photos=affected_photos,
        removed_route_days=removed_route_days,
        retained_last_day=retained_last_day,
        invalidated_retained_route_days=invalidated,
    )


def apply_trip_resize(session: Session, trip: Trip, plan: TripResizePlan) -> list[PhotoCleanupTarget]:
    """Apply a previously analyzed resize; callers must commit exactly once."""
    cleanup_targets = [
        PhotoCleanupTarget(photo.file_path, photo.night_id, photo.id)
        for photo in plan.affected_photos
    ]
    for night in plan.affected_nights:
        session.delete(night)
    session.flush()
    for day in plan.removed_days:
        trip.days.remove(day)
    for day in plan.invalidated_retained_route_days:
        stale(day)
    session.flush()
    normalize_day_order(trip)
    synchronize_trip_dates(trip)
    return cleanup_targets


def next_day_color(days: list[TripDay]) -> str:
    used = {day.color.upper() for day in days if getattr(day, "color", None)}
    return next((color for color in DAY_COLOR_PALETTE if color not in used), DAY_COLOR_PALETTE[len(days) % len(DAY_COLOR_PALETTE)])


def load_trip(session: Session, trip_id: UUID) -> Trip:
    trip = session.scalar(
        select(Trip)
        .where(Trip.id == trip_id, Trip.deleted_at.is_(None))
        .options(
            selectinload(Trip.days).selectinload(TripDay.stops),
            selectinload(Trip.nights).selectinload(TripNight.photos),
            selectinload(Trip.departure),
            selectinload(Trip.arrival),
        )
        .execution_options(populate_existing=True)
    )
    if trip is None: raise HTTPException(404, "Trip not found")
    return trip


def place_snapshot(session: Session, place_id: UUID, map_id: UUID) -> tuple[Place, float, float]:
    # A shared row lock serializes trip references with Place moves, which take
    # the exclusive lock before checking blockers.
    place = session.scalar(
        select(Place).where(Place.id == place_id, Place.deleted_at.is_(None)).with_for_update(read=True).execution_options(populate_existing=True)
    )
    if place is None or place.map_id != map_id: raise HTTPException(422, "Place must belong to the trip map")
    longitude, latitude = session.execute(select(func.ST_X(Place.location), func.ST_Y(Place.location)).where(Place.id == place_id)).one()
    if longitude is None or latitude is None: raise HTTPException(422, "Place has no usable coordinates")
    return place, float(latitude), float(longitude)


def stale(day: TripDay) -> None:
    if day.route_status == "ready": day.route_status = "stale"


def day_last_stop_id(day: TripDay) -> UUID | None:
    """The day's ending boundary stop, or None when the day has no stop."""

    if not day.stops:
        return None
    return max(day.stops, key=lambda item: item.sort_order).id


def stale_route_and_following(day: TripDay, *, boundary_changed: bool) -> None:
    """Stale a mutated day and propagate to the following day only when that
    day's start basis actually changed.

    The next day starts from the previous day's last effective stop only when
    no TripNight bridges the two days; a night is the boundary itself and
    already carries its own snapshot.
    """

    stale(day)
    if not boundary_changed:
        return
    ordered_days = sorted(day.trip.days, key=lambda item: item.sort_order)
    position = ordered_days.index(day)
    if position + 1 >= len(ordered_days):
        return
    following = ordered_days[position + 1]
    bridging_night = any(
        night.previous_day_id == day.id and night.next_day_id == following.id
        for night in day.trip.nights
    )
    if not bridging_night:
        stale(following)


def synchronize_place_coordinate_references(
    session: Session,
    place_id: UUID,
    latitude: float,
    longitude: float,
) -> None:
    """Propagate canonical Place coordinates to mutable trip snapshots.

    AUD-014. Routes never read ``Place.location`` directly: they are computed
    from the lat/lon snapshots stored on TripStop/TripNight/TripDeparture/
    TripArrival.  When a Place moves, every mutable trip referencing it must
    have those snapshots refreshed in bulk, and every affected route marked
    stale.  completed/archived trips keep their frozen historical snapshots.

    Must run inside the Place mutation transaction.  The affected Trip rows
    are locked in deterministic id order with the same FOR UPDATE lock used
    by route calculation, so a concurrent calculation can never commit a
    ready route built from pre-sync snapshots (TOCTOU).
    """

    candidate_trip_ids = sorted({
        *session.scalars(
            select(TripDay.trip_id).join(TripStop, TripStop.trip_day_id == TripDay.id).where(TripStop.place_id == place_id)
        ),
        *session.scalars(select(TripNight.trip_id).where(TripNight.place_id == place_id)),
        *session.scalars(select(TripDeparture.trip_id).where(TripDeparture.place_id == place_id)),
        *session.scalars(select(TripArrival.trip_id).where(TripArrival.place_id == place_id)),
    })
    if not candidate_trip_ids:
        return

    locked_trip_ids = session.scalars(
        select(Trip.id).where(Trip.id.in_(candidate_trip_ids)).order_by(Trip.id).with_for_update()
    ).all()
    # Re-validate mutability after waiting on the lock: another transaction
    # may have completed or archived the trip while we were waiting.
    mutable_trip_ids = [
        trip_id
        for trip_id in locked_trip_ids
        if session.get(Trip, trip_id).status in MUTABLE_TRIP_STATUSES
    ]
    if not mutable_trip_ids:
        return

    day_scope = select(TripDay.id).where(TripDay.trip_id.in_(mutable_trip_ids))
    session.execute(
        update(TripStop)
        .where(TripStop.place_id == place_id, TripStop.trip_day_id.in_(day_scope))
        .values(latitude=latitude, longitude=longitude)
    )
    for model in (TripNight, TripDeparture, TripArrival):
        session.execute(
            update(model)
            .where(model.place_id == place_id, model.trip_id.in_(mutable_trip_ids))
            .values(latitude=latitude, longitude=longitude)
        )

    stale_day_ids = _route_days_affected_by_place(session, place_id, mutable_trip_ids)
    if stale_day_ids:
        session.execute(
            update(TripDay)
            .where(TripDay.id.in_(stale_day_ids), TripDay.route_status == "ready")
            .values(route_status="stale")
        )


def _route_days_affected_by_place(session: Session, place_id: UUID, mutable_trip_ids: list[UUID]) -> set[UUID]:
    """Days whose routing inputs change when this Place moves."""

    affected: set[UUID] = set()

    day_rows = session.execute(
        select(TripDay.id, TripDay.trip_id, TripDay.sort_order)
        .where(TripDay.trip_id.in_(mutable_trip_ids))
        .order_by(TripDay.trip_id, TripDay.sort_order)
    ).all()
    days_by_trip: dict[UUID, list[UUID]] = {}
    trip_of_day: dict[UUID, UUID] = {}
    for day_id, trip_id, _sort_order in day_rows:
        days_by_trip.setdefault(trip_id, []).append(day_id)
        trip_of_day[day_id] = trip_id

    # Days whose own content references the place (its stops).
    stop_days = session.scalars(
        select(TripStop.trip_day_id).where(
            TripStop.place_id == place_id,
            TripStop.trip_day_id.in_(list(trip_of_day)),
        )
    ).all()
    affected.update(stop_days)

    # A place used as a night is the boundary between its two days.
    night_pairs = session.execute(
        select(TripNight.previous_day_id, TripNight.next_day_id)
        .where(TripNight.place_id == place_id, TripNight.trip_id.in_(mutable_trip_ids))
    ).all()
    for previous_day_id, next_day_id in night_pairs:
        affected.add(previous_day_id)
        affected.add(next_day_id)

    departure_trip_ids = set(session.scalars(
        select(TripDeparture.trip_id).where(TripDeparture.place_id == place_id, TripDeparture.trip_id.in_(mutable_trip_ids))
    ))
    arrival_trip_ids = set(session.scalars(
        select(TripArrival.trip_id).where(TripArrival.place_id == place_id, TripArrival.trip_id.in_(mutable_trip_ids))
    ))
    for trip_id in departure_trip_ids:
        first_day = days_by_trip.get(trip_id)
        if first_day:
            affected.add(first_day[0])
    for trip_id in arrival_trip_ids:
        last_day = days_by_trip.get(trip_id)
        if last_day:
            affected.add(last_day[-1])

    # Boundary propagation: when a moved place owns the last effective stop
    # of a day and no night bridges that day to the next one, the next day's
    # starting point changes too.
    bridging_next_by_day = dict(session.execute(
        select(TripNight.previous_day_id, TripNight.next_day_id)
        .where(TripNight.trip_id.in_(mutable_trip_ids))
    ).all())
    last_stop_place_by_day: dict[UUID, tuple[int, UUID | None]] = {}
    for day_stop_rows in session.execute(
        select(TripStop.trip_day_id, TripStop.sort_order, TripStop.place_id)
        .where(TripStop.trip_day_id.in_(list(affected)))
    ).all():
        day_id, sort_order, stop_place_id = day_stop_rows
        current = last_stop_place_by_day.get(day_id)
        if current is None or sort_order > current[0]:
            last_stop_place_by_day[day_id] = (sort_order, stop_place_id)
    for day_id in list(affected):
        following = None
        trip_id = trip_of_day.get(day_id)
        ordered = days_by_trip.get(trip_id, [])
        position = ordered.index(day_id) if day_id in ordered else -1
        if position >= 0 and position + 1 < len(ordered):
            following = ordered[position + 1]
        if following is None or bridging_next_by_day.get(day_id) == following:
            continue
        last_entry = last_stop_place_by_day.get(day_id)
        if last_entry is not None and last_entry[1] == place_id:
            affected.add(following)

    return affected


def normalize_day_order(trip: Trip) -> None:
    for index, day in enumerate(sorted(trip.days, key=lambda item: item.sort_order)):
        day.sort_order = index; day.day_number = index + 1


def synchronize_trip_dates(trip: Trip) -> None:
    """Derive the trip and day dates from the selected departure date."""
    ordered_days = sorted(trip.days, key=lambda item: item.sort_order)
    if trip.start_date is None:
        trip.end_date = None
        for day in ordered_days:
            day.date = None
        return
    for index, day in enumerate(ordered_days):
        day.date = trip.start_date + timedelta(days=index)
    trip.end_date = trip.start_date + timedelta(days=max(len(ordered_days) - 1, 0))


def resize_trip_days(session: Session, trip: Trip, day_count: int) -> None:
    """Resize a trip while retaining existing days from the beginning."""
    plan = analyze_trip_resize(trip, day_count)
    if plan.removed_days:
        apply_trip_resize(session, trip, plan)
    elif day_count > len(trip.days):
        ordered_days = sorted(trip.days, key=lambda item: item.sort_order)
        for index in range(len(ordered_days), day_count):
            trip.days.append(TripDay(day_number=index + 1, sort_order=index, color=next_day_color(trip.days)))
        session.flush()
        normalize_day_order(trip)
        synchronize_trip_dates(trip)
    else:
        synchronize_trip_dates(trip)


def normalize_stop_order(day: TripDay) -> None:
    for index, stop in enumerate(sorted(day.stops, key=lambda item: item.sort_order)): stop.sort_order = index


def previous_day_last_stop(day: TripDay) -> TripStop | None:
    """Return the last real stop from the day before ``day``.

    A night remains optional: when it has not been defined, the following day
    naturally starts where the previous one ended.  This is deliberately a
    routing-only fallback; it does not create a synthetic overnight record.
    """
    previous_days = [candidate for candidate in day.trip.days if candidate.sort_order < day.sort_order]
    if not previous_days:
        return None
    previous_day = max(previous_days, key=lambda candidate: candidate.sort_order)
    return max(previous_day.stops, key=lambda stop: stop.sort_order, default=None)


def day_coordinates(day: TripDay) -> tuple[list[tuple[float, float]], list[str]]:
    coordinates: list[tuple[float, float]] = []
    labels: list[str] = []
    if day.previous_night:
        coordinates.append((day.previous_night.longitude, day.previous_night.latitude)); labels.append(f"night:{day.previous_night.id}")
    elif day.day_number == 1 and day.trip.departure:
        coordinates.append((day.trip.departure.longitude, day.trip.departure.latitude)); labels.append(f"departure:{day.trip.departure.id}")
    elif previous_stop := previous_day_last_stop(day):
        coordinates.append((previous_stop.longitude, previous_stop.latitude)); labels.append(f"previous-stop:{previous_stop.id}")
    for stop in sorted(day.stops, key=lambda item: item.sort_order):
        coordinates.append((stop.longitude, stop.latitude)); labels.append(f"stop:{stop.id}")
    if day.next_night:
        coordinates.append((day.next_night.longitude, day.next_night.latitude)); labels.append(f"night:{day.next_night.id}")
    elif day.day_number == len(day.trip.days):
        arrival = getattr(day.trip, "arrival", None) or getattr(day.trip, "departure", None)
        if arrival:
            coordinates.append((arrival.longitude, arrival.latitude)); labels.append(f"arrival:{arrival.id}")
    return coordinates, labels


class CountryRouteError(HTTPException):
    """A business error that remains readable to API clients."""

    def __init__(self, code: str, message: str, *, country_code: str | None = None):
        detail: dict[str, object] = {"code": code, "message": message}
        if country_code:
            detail["country_code"] = country_code
        super().__init__(409, detail=detail)


def resolve_constraint_country(session: Session, trip: Trip) -> Country:
    poi_map = session.get(PoiMap, trip.map_id)
    country = session.get(Country, poi_map.country_id) if poi_map else None
    if country is None:
        raise CountryRouteError("ROUTE_COUNTRY_UNAVAILABLE", "Impossible de déterminer le pays de cette sortie.")
    return country


def validate_route_constraint(session: Session, day: TripDay, constraints: RoutingConstraints, geometry: dict) -> CountryRouteValidation | None:
    if not constraints.stay_in_country:
        return None
    country = resolve_constraint_country(session, day.trip)
    if constraints.country_code and constraints.country_code != country.iso_alpha3:
        raise CountryRouteError("ROUTE_COUNTRY_UNAVAILABLE", "Le pays de contrainte ne correspond pas à la carte.", country_code=country.iso_alpha3)
    result = CountryRouteValidator().validate_route_within_country(geometry, country.iso_alpha3)
    if result.reason == "boundary_unavailable":
        raise CountryRouteError("ROUTE_COUNTRY_BOUNDARY_UNAVAILABLE", f"La frontière locale de {country.name} n’est pas disponible.", country_code=country.iso_alpha3)
    if result.reason == "invalid_geometry":
        raise CountryRouteError("ROUTE_COUNTRY_UNAVAILABLE", "La géométrie de l’itinéraire ne peut pas être vérifiée.", country_code=country.iso_alpha3)
    if not result.is_valid:
        raise CountryRouteError("ROUTE_LEAVES_COUNTRY", f"L’itinéraire proposé quitte {country.name}. Le moteur actuel ne peut pas proposer automatiquement une alternative restant dans le pays.", country_code=country.iso_alpha3)
    return result


def calculate_day_route(session: Session, day: TripDay, provider: RoutingProvider, profile: str, constraints: RoutingConstraints | None = None) -> TripDay:
    coordinates, labels = day_coordinates(day)
    if len(coordinates) < 2: raise HTTPException(422, "At least two route points are required")
    try: result = provider.calculate_route(coordinates, profile)
    except RoutingError as error:
        status = 429 if error.code == "GOOGLE_ROUTING_RATE_LIMITED" else 503 if error.code == "ROUTING_PROVIDER_UNAVAILABLE" else 502
        headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
        raise HTTPException(status, {"code": error.code, "message": str(error)}, headers=headers) from error
    actual_provider = str(getattr(provider, "last_provider_id", provider.provider_id))
    apply_day_route_result(session, day, result, actual_provider, constraints, labels=labels, commit=True)
    return day


def apply_day_route_result(
    session: Session,
    day: TripDay,
    result: RouteResult,
    provider_id: str,
    constraints: RoutingConstraints | None = None,
    *,
    labels: list[str] | None = None,
    commit: bool = False,
) -> TripDay:
    if labels is None:
        _, labels = day_coordinates(day)
    validate_route_constraint(session, day, constraints or RoutingConstraints(), result.geometry)
    # Mutate only after the post-routing validation: an invalid route never
    # replaces a previously valid one or its metrics.
    day.route_geometry = result.geometry
    day.route_distance_meters = result.distance_meters
    day.route_duration_seconds = result.duration_seconds
    day.route_segments = [{**segment, "from": labels[index], "to": labels[index + 1], "routable": True} for index, segment in enumerate(result.segments)]
    day.route_status = "ready"
    day.route_provider = provider_id
    metrics = day_summary(day)
    day.visit_duration_minutes = metrics["visit_duration_minutes"]
    day.total_duration_minutes = metrics["total_duration_minutes"]
    if commit:
        session.commit()
    else:
        session.flush()
    return day
