from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from io import TextIOWrapper
import json
import os
import tempfile
from typing import Any, Iterator
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.auth.dependencies import get_current_session, require_admin
from app.auth.models import User, UserSession
from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.categories.models import Category
from app.database import get_db
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place, PlaceHistory, PlaceLink
from app.privacy.schemas import ConsentPreferences, ConsentRead, PrivacySettingsRead, PrivacySettingsUpdate
from app.privacy.settings import CONSENT_VERSION, PrivacySettings, get_privacy_settings, save_privacy_settings
from app.statuses.models import PlaceStatus
from app.tags.models import Tag
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop


router = APIRouter(prefix="/privacy", tags=["privacy"])
account_router = APIRouter(prefix="/account/privacy", tags=["account"])
admin_router = APIRouter(prefix="/admin/console/privacy", tags=["admin-console"], dependencies=[Depends(require_admin)])

EXPORT_BATCH_SIZE = 500
_EXPORT_README = "Personal CartaVault data export. Secrets and shared resources owned by other users are excluded.\n"
_EXPORT_OMISSIONS = (
    "password hashes, session and CSRF tokens, MFA secrets, recovery codes, API credentials and encryption keys",
    "shared-map content owned by another user",
    "media binary files; metadata and references are included",
)

_MAP_FIELDS = ("id", "name", "country_id", "is_private", "center_latitude", "center_longitude", "default_zoom", "created_at", "updated_at")
_MEMBERSHIP_FIELDS = ("map_id", "role", "created_at")
_CATEGORY_FIELDS = ("id", "map_id", "name", "icon", "description", "marks_as_visited", "sort_order")
_TAG_FIELDS = ("id", "map_id", "name", "color", "sort_order")
_STATUS_FIELDS = ("id", "map_id", "name", "color", "is_default", "sort_order", "created_at", "updated_at")
_PLACE_FIELDS = (
    "id", "map_id", "name", "description", "region", "country", "country_code", "condition", "danger_level",
    "is_favorite", "interest_rating", "visit_rating", "default_visit_duration_minutes", "custom_fields", "created_at",
    "updated_at", "deleted_at", "purge_after",
)
_PLACE_LINK_FIELDS = ("id", "place_id", "url", "label", "sort_order", "created_at", "updated_at")
_PHOTO_FIELDS = (
    "id", "place_id", "map_id", "storage_scope_id", "filename", "original_name", "mime_type", "file_size_bytes",
    "width", "height", "latitude", "longitude", "taken_at", "description", "is_primary", "sort_order", "created_at",
    "updated_at",
)
_TRIP_FIELDS = (
    "id", "map_id", "name", "description", "start_date", "end_date", "status", "routing_profile", "stay_in_country",
    "avoid_tolls", "avoid_highways", "avoid_ferries", "traffic_mode", "low_load_max_minutes", "medium_load_max_minutes",
    "low_load_color", "medium_load_color", "high_load_color", "completed_at", "archived_at", "created_at", "updated_at",
    "deleted_at", "purge_after",
)
_TRIP_DAY_FIELDS = (
    "id", "trip_id", "day_number", "date", "title", "color", "notes", "planned_start_time", "planned_end_time",
    "target_arrival_time", "default_stop_buffer_minutes", "safety_margin_type", "safety_margin_value",
    "max_total_duration_minutes", "route_distance_meters", "route_duration_seconds", "visit_duration_minutes",
    "total_duration_minutes", "route_geometry", "route_segments", "route_status", "route_provider", "sort_order",
    "created_at", "updated_at",
)
_TRIP_STOP_FIELDS = (
    "id", "trip_day_id", "place_id", "stop_type", "name", "latitude", "longitude", "address", "sort_order",
    "visit_duration_minutes", "planned_arrival", "planned_departure", "notes", "is_required", "is_locked", "visit_status",
    "created_at", "updated_at",
)
_TRIP_NIGHT_FIELDS = (
    "id", "trip_id", "previous_day_id", "next_day_id", "place_id", "source_type", "name", "latitude", "longitude",
    "address", "google_place_id", "website_url", "description", "notes", "check_in_from_time", "check_in_until_time",
    "check_out_from_time", "check_out_until_time", "created_at", "updated_at",
)
_TRIP_NIGHT_PHOTO_FIELDS = ("id", "night_id", "mime_type", "file_size_bytes", "sort_order", "created_at")
_TRIP_DEPARTURE_FIELDS = (
    "id", "trip_id", "place_id", "name", "latitude", "longitude", "address", "notes", "departure_time", "created_at",
    "updated_at",
)
_TRIP_ARRIVAL_FIELDS = (
    "id", "trip_id", "place_id", "name", "latitude", "longitude", "address", "notes", "created_at", "updated_at",
)
_ANNOTATION_TEMPLATE_FIELDS = (
    "id", "map_id", "name", "shape_type", "icon", "color", "sort_order", "is_active", "created_at", "updated_at",
)
_ANNOTATION_FIELDS = (
    "id", "place_id", "template_id", "geometry", "radius_meters", "title", "description", "created_at", "updated_at",
)
_PLACE_HISTORY_FIELDS = ("id", "place_id", "user_id", "action", "changes", "created_at")


def _read(settings: PrivacySettings) -> PrivacySettingsRead:
    return PrivacySettingsRead(
        **settings.__dict__, consent_required=settings.consent_required, consent_version=CONSENT_VERSION,
    )


@router.get("/configuration", response_model=PrivacySettingsRead)
def privacy_configuration(session: Session = Depends(get_db)) -> PrivacySettingsRead:
    """Public, secret-free feature state used to decide whether consent is needed."""
    return _read(get_privacy_settings(session))


@admin_router.get("/settings", response_model=PrivacySettingsRead)
def admin_privacy_settings(session: Session = Depends(get_db)) -> PrivacySettingsRead:
    return _read(get_privacy_settings(session))


@admin_router.put("/settings", response_model=PrivacySettingsRead)
def update_admin_privacy_settings(payload: PrivacySettingsUpdate, session: Session = Depends(get_db)) -> PrivacySettingsRead:
    settings = PrivacySettings(**payload.model_dump())
    return _read(save_privacy_settings(session, settings))


def _consent(user: User) -> ConsentRead:
    stored = (user.preferences or {}).get("privacy_consent")
    source = stored if isinstance(stored, dict) else {}
    updated_at = source.get("updated_at")
    if isinstance(updated_at, str):
        try:
            updated_at = datetime.fromisoformat(updated_at)
        except ValueError:
            updated_at = None
    return ConsentRead(
        analytics=bool(source.get("analytics", False)),
        functional_optional=bool(source.get("functional_optional", False)),
        marketing=bool(source.get("marketing", False)),
        third_party=bool(source.get("third_party", False)),
        version=str(source.get("version", CONSENT_VERSION)),
        updated_at=updated_at if isinstance(updated_at, datetime) else None,
    )


@account_router.get("/consent", response_model=ConsentRead)
def get_consent(current: UserSession = Depends(get_current_session)) -> ConsentRead:
    return _consent(current.user)


@account_router.put("/consent", response_model=ConsentRead)
def update_consent(payload: ConsentPreferences, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> ConsentRead:
    now = datetime.now(UTC).replace(tzinfo=None)
    preferences = dict(current.user.preferences or {})
    preferences["privacy_consent"] = {**payload.model_dump(), "version": CONSENT_VERSION, "updated_at": now.isoformat()}
    current.user.preferences = preferences
    session.commit()
    return _consent(current.user)


@dataclass(frozen=True, slots=True)
class _ExportSection:
    name: str
    value: object
    is_collection: bool = False


def _model_dicts(session: Session, statement, fields: tuple[str, ...]) -> Iterator[dict[str, Any]]:
    result = session.scalars(statement.execution_options(yield_per=EXPORT_BATCH_SIZE))
    for item in result:
        yield {key: getattr(item, key) for key in fields}


def _place_dicts(session: Session, owned_place_ids) -> Iterator[dict[str, Any]]:
    statement = (
        select(Place, func.ST_Y(Place.location), func.ST_X(Place.location))
        .where(Place.id.in_(owned_place_ids))
        .execution_options(yield_per=EXPORT_BATCH_SIZE)
    )
    for item, latitude, longitude in session.execute(statement):
        yield {
            **{key: getattr(item, key) for key in _PLACE_FIELDS},
            "latitude": latitude,
            "longitude": longitude,
        }


def _export_sections(session: Session, user: User) -> Iterator[_ExportSection]:
    owned_map_ids = select(PoiMap.id).where(PoiMap.owner_id == user.id)
    owned_place_ids = select(Place.id).where(Place.map_id.in_(owned_map_ids))
    owned_trip_ids = select(Trip.id).where(Trip.map_id.in_(owned_map_ids))
    owned_trip_day_ids = select(TripDay.id).where(TripDay.trip_id.in_(owned_trip_ids))
    owned_trip_night_ids = select(TripNight.id).where(TripNight.trip_id.in_(owned_trip_ids))

    yield _ExportSection("format", "cartavault-personal-data-export")
    yield _ExportSection("version", 1)
    yield _ExportSection("exported_at", datetime.now(UTC).isoformat())
    yield _ExportSection("account", {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login_at": user.last_login_at,
        "preferences": user.preferences or {},
    })
    yield _ExportSection(
        "owned_maps",
        _model_dicts(session, select(PoiMap).where(PoiMap.owner_id == user.id), _MAP_FIELDS),
        True,
    )
    yield _ExportSection(
        "memberships",
        _model_dicts(session, select(MapMembership).where(MapMembership.user_id == user.id), _MEMBERSHIP_FIELDS),
        True,
    )
    yield _ExportSection(
        "categories",
        _model_dicts(session, select(Category).where(Category.map_id.in_(owned_map_ids)), _CATEGORY_FIELDS),
        True,
    )
    yield _ExportSection(
        "tags",
        _model_dicts(session, select(Tag).where(Tag.map_id.in_(owned_map_ids)), _TAG_FIELDS),
        True,
    )
    yield _ExportSection(
        "statuses",
        _model_dicts(session, select(PlaceStatus).where(PlaceStatus.map_id.in_(owned_map_ids)), _STATUS_FIELDS),
        True,
    )
    yield _ExportSection("places", _place_dicts(session, owned_place_ids), True)
    yield _ExportSection(
        "place_links",
        _model_dicts(session, select(PlaceLink).where(PlaceLink.place_id.in_(owned_place_ids)), _PLACE_LINK_FIELDS),
        True,
    )
    yield _ExportSection(
        "media_metadata",
        _model_dicts(
            session,
            select(Photo).where(or_(
                Photo.uploaded_by_user_id == user.id,
                Photo.place_id.in_(owned_place_ids),
                (Photo.map_id.in_(owned_map_ids)) & Photo.place_id.is_(None),
            )),
            _PHOTO_FIELDS,
        ),
        True,
    )
    yield _ExportSection(
        "trips",
        _model_dicts(session, select(Trip).where(Trip.id.in_(owned_trip_ids)), _TRIP_FIELDS),
        True,
    )
    yield _ExportSection(
        "trip_days",
        _model_dicts(session, select(TripDay).where(TripDay.id.in_(owned_trip_day_ids)), _TRIP_DAY_FIELDS),
        True,
    )
    yield _ExportSection(
        "trip_stops",
        _model_dicts(session, select(TripStop).where(TripStop.trip_day_id.in_(owned_trip_day_ids)), _TRIP_STOP_FIELDS),
        True,
    )
    yield _ExportSection(
        "trip_nights",
        _model_dicts(session, select(TripNight).where(TripNight.id.in_(owned_trip_night_ids)), _TRIP_NIGHT_FIELDS),
        True,
    )
    yield _ExportSection(
        "trip_night_photos",
        _model_dicts(
            session,
            select(TripNightPhoto).where(TripNightPhoto.night_id.in_(owned_trip_night_ids)),
            _TRIP_NIGHT_PHOTO_FIELDS,
        ),
        True,
    )
    yield _ExportSection(
        "trip_departures",
        _model_dicts(session, select(TripDeparture).where(TripDeparture.trip_id.in_(owned_trip_ids)), _TRIP_DEPARTURE_FIELDS),
        True,
    )
    yield _ExportSection(
        "trip_arrivals",
        _model_dicts(session, select(TripArrival).where(TripArrival.trip_id.in_(owned_trip_ids)), _TRIP_ARRIVAL_FIELDS),
        True,
    )
    yield _ExportSection(
        "annotation_templates",
        _model_dicts(
            session,
            select(AnnotationTemplate).where(AnnotationTemplate.map_id.in_(owned_map_ids)),
            _ANNOTATION_TEMPLATE_FIELDS,
        ),
        True,
    )
    yield _ExportSection(
        "annotations",
        _model_dicts(
            session,
            select(PlaceAnnotation).where(PlaceAnnotation.place_id.in_(owned_place_ids)),
            _ANNOTATION_FIELDS,
        ),
        True,
    )
    yield _ExportSection(
        "place_history",
        _model_dicts(session, select(PlaceHistory).where(PlaceHistory.place_id.in_(owned_place_ids)), _PLACE_HISTORY_FIELDS),
        True,
    )
    yield _ExportSection("omissions", list(_EXPORT_OMISSIONS))


def _data_export(session: Session, user: User) -> dict[str, object]:
    """Materialize the same section source used by the streaming ZIP writer."""
    return {
        section.name: list(section.value) if section.is_collection else section.value
        for section in _export_sections(session, user)
    }


def _json_default(value: object) -> object:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value) if value.as_tuple().exponent >= 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


_JSON_ENCODER = json.JSONEncoder(ensure_ascii=False, separators=(",", ":"), default=_json_default)


def _write_json_value(output, value: object) -> None:
    output.write(_JSON_ENCODER.encode(value))


def _write_export_json(output, session: Session, user: User) -> None:
    output.write("{")
    first_section = True
    for section in _export_sections(session, user):
        if not first_section:
            output.write(",")
        first_section = False
        _write_json_value(output, section.name)
        output.write(":")
        if not section.is_collection:
            _write_json_value(output, section.value)
            continue

        output.write("[")
        first_item = True
        for item in section.value:  # type: ignore[union-attr]
            if not first_item:
                output.write(",")
            first_item = False
            _write_json_value(output, item)
        output.write("]")
    output.write("}")


def _remove_export_file(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def _create_export_archive(session: Session, user: User) -> str:
    temporary = tempfile.NamedTemporaryFile(prefix="cartavault-privacy-", suffix=".zip", delete=False)
    path = temporary.name
    temporary.close()
    completed = False
    try:
        with ZipFile(path, "w", ZIP_DEFLATED) as bundle:
            with bundle.open("cartavault-data.json", "w") as binary_output:
                with TextIOWrapper(binary_output, encoding="utf-8") as output:
                    _write_export_json(output, session, user)
            bundle.writestr("README.txt", _EXPORT_README)
        completed = True
    finally:
        if not completed:
            _remove_export_file(path)
    return path


@account_router.get("/export")
def export_personal_data(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> FileResponse:
    """Return the authenticated user's own portable export without secrets."""
    archive_path = _create_export_archive(session, current.user)
    return FileResponse(
        archive_path,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="cartavault-personal-data.zip"', "Cache-Control": "no-store"},
        background=BackgroundTask(_remove_export_file, archive_path),
    )
