from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
import json
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

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


def _rows(session: Session, model, map_ids: list) -> list:
    return [] if not map_ids else list(session.scalars(select(model).where(model.map_id.in_(map_ids))))


def _data_export(session: Session, user: User) -> dict[str, object]:
    maps = list(session.scalars(select(PoiMap).where(PoiMap.owner_id == user.id)))
    map_ids = [item.id for item in maps]
    places = _rows(session, Place, map_ids)
    place_ids = [item.id for item in places]
    links = [] if not place_ids else list(session.scalars(select(PlaceLink).where(PlaceLink.place_id.in_(place_ids))))
    media_conditions = [Photo.uploaded_by_user_id == user.id]
    if place_ids:
        media_conditions.append(Photo.place_id.in_(place_ids))
    if map_ids:
        media_conditions.append((Photo.map_id.in_(map_ids)) & Photo.place_id.is_(None))
    photos = list(session.scalars(select(Photo).where(or_(*media_conditions))))
    trips = [] if not map_ids else list(session.scalars(select(Trip).where(Trip.map_id.in_(map_ids))))
    trip_ids = [item.id for item in trips]
    days = [] if not trip_ids else list(session.scalars(select(TripDay).where(TripDay.trip_id.in_(trip_ids))))
    day_ids = [item.id for item in days]
    stops = [] if not day_ids else list(session.scalars(select(TripStop).where(TripStop.trip_day_id.in_(day_ids))))
    nights = [] if not trip_ids else list(session.scalars(select(TripNight).where(TripNight.trip_id.in_(trip_ids))))
    night_ids = [item.id for item in nights]
    night_photos = [] if not night_ids else list(session.scalars(select(TripNightPhoto).where(TripNightPhoto.night_id.in_(night_ids))))
    departures = [] if not trip_ids else list(session.scalars(select(TripDeparture).where(TripDeparture.trip_id.in_(trip_ids))))
    arrivals = [] if not trip_ids else list(session.scalars(select(TripArrival).where(TripArrival.trip_id.in_(trip_ids))))
    templates = _rows(session, AnnotationTemplate, map_ids)
    annotations = [] if not place_ids else list(session.scalars(select(PlaceAnnotation).where(PlaceAnnotation.place_id.in_(place_ids))))
    histories = [] if not place_ids else list(session.scalars(select(PlaceHistory).where(PlaceHistory.place_id.in_(place_ids))))
    memberships = list(session.scalars(select(MapMembership).where(MapMembership.user_id == user.id)))
    place_coordinates = {
        item.id: (latitude, longitude)
        for item, latitude, longitude in session.execute(
            select(Place, func.ST_Y(Place.location), func.ST_X(Place.location)).where(Place.id.in_(place_ids))
        ).all()
    } if place_ids else {}
    return {
        "format": "cartavault-personal-data-export",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "account": {
            "id": user.id, "email": user.email, "display_name": user.display_name,
            "created_at": user.created_at, "updated_at": user.updated_at,
            "last_login_at": user.last_login_at, "preferences": user.preferences or {},
        },
        "owned_maps": [{key: getattr(item, key) for key in ("id", "name", "country_id", "is_private", "center_latitude", "center_longitude", "default_zoom", "created_at", "updated_at")} for item in maps],
        "memberships": [{"map_id": item.map_id, "role": item.role, "created_at": item.created_at} for item in memberships],
        "categories": [{key: getattr(item, key) for key in ("id", "map_id", "name", "icon", "description", "marks_as_visited", "sort_order")} for item in _rows(session, Category, map_ids)],
        "tags": [{key: getattr(item, key) for key in ("id", "map_id", "name", "color", "sort_order")} for item in _rows(session, Tag, map_ids)],
        "statuses": [{key: getattr(item, key) for key in ("id", "map_id", "name", "color", "is_default", "sort_order", "created_at", "updated_at")} for item in _rows(session, PlaceStatus, map_ids)],
        "places": [{**{key: getattr(item, key) for key in ("id", "map_id", "name", "description", "region", "country", "country_code", "condition", "danger_level", "is_favorite", "interest_rating", "visit_rating", "default_visit_duration_minutes", "custom_fields", "created_at", "updated_at", "deleted_at", "purge_after")}, "latitude": place_coordinates[item.id][0], "longitude": place_coordinates[item.id][1]} for item in places],
        "place_links": [{key: getattr(item, key) for key in ("id", "place_id", "url", "label", "sort_order", "created_at", "updated_at")} for item in links],
        "media_metadata": [{key: getattr(item, key) for key in ("id", "place_id", "map_id", "storage_scope_id", "filename", "original_name", "mime_type", "file_size_bytes", "width", "height", "latitude", "longitude", "taken_at", "description", "is_primary", "sort_order", "created_at", "updated_at")} for item in photos],
        "trips": [{key: getattr(item, key) for key in ("id", "map_id", "name", "description", "start_date", "end_date", "status", "routing_profile", "stay_in_country", "avoid_tolls", "avoid_highways", "avoid_ferries", "traffic_mode", "low_load_max_minutes", "medium_load_max_minutes", "low_load_color", "medium_load_color", "high_load_color", "completed_at", "archived_at", "created_at", "updated_at", "deleted_at", "purge_after")} for item in trips],
        "trip_days": [{key: getattr(item, key) for key in ("id", "trip_id", "day_number", "date", "title", "color", "notes", "planned_start_time", "planned_end_time", "target_arrival_time", "default_stop_buffer_minutes", "safety_margin_type", "safety_margin_value", "max_total_duration_minutes", "route_distance_meters", "route_duration_seconds", "visit_duration_minutes", "total_duration_minutes", "route_geometry", "route_segments", "route_status", "route_provider", "sort_order", "created_at", "updated_at")} for item in days],
        "trip_stops": [{key: getattr(item, key) for key in ("id", "trip_day_id", "place_id", "stop_type", "name", "latitude", "longitude", "address", "sort_order", "visit_duration_minutes", "planned_arrival", "planned_departure", "notes", "is_required", "is_locked", "visit_status", "created_at", "updated_at")} for item in stops],
        "trip_nights": [{key: getattr(item, key) for key in ("id", "trip_id", "previous_day_id", "next_day_id", "place_id", "source_type", "name", "latitude", "longitude", "address", "google_place_id", "website_url", "description", "notes", "check_in_from_time", "check_in_until_time", "check_out_from_time", "check_out_until_time", "created_at", "updated_at")} for item in nights],
        "trip_night_photos": [{key: getattr(item, key) for key in ("id", "night_id", "mime_type", "file_size_bytes", "sort_order", "created_at")} for item in night_photos],
        "trip_departures": [{key: getattr(item, key) for key in ("id", "trip_id", "place_id", "name", "latitude", "longitude", "address", "notes", "departure_time", "created_at", "updated_at")} for item in departures],
        "trip_arrivals": [{key: getattr(item, key) for key in ("id", "trip_id", "place_id", "name", "latitude", "longitude", "address", "notes", "created_at", "updated_at")} for item in arrivals],
        "annotation_templates": [{key: getattr(item, key) for key in ("id", "map_id", "name", "shape_type", "icon", "color", "sort_order", "is_active", "created_at", "updated_at")} for item in templates],
        "annotations": [{key: getattr(item, key) for key in ("id", "place_id", "template_id", "geometry", "radius_meters", "title", "description", "created_at", "updated_at")} for item in annotations],
        "place_history": [{key: getattr(item, key) for key in ("id", "place_id", "user_id", "action", "changes", "created_at")} for item in histories],
        "omissions": [
            "password hashes, session and CSRF tokens, MFA secrets, recovery codes, API credentials and encryption keys",
            "shared-map content owned by another user",
            "media binary files; metadata and references are included",
        ],
    }


@account_router.get("/export")
def export_personal_data(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> StreamingResponse:
    """Return the authenticated user's own portable export without secrets."""
    payload = json.dumps(jsonable_encoder(_data_export(session, current.user)), ensure_ascii=False, indent=2).encode("utf-8")
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        bundle.writestr("cartavault-data.json", payload)
        bundle.writestr("README.txt", "Personal CartaVault data export. Secrets and shared resources owned by other users are excluded.\n")
    archive.seek(0)
    return StreamingResponse(
        archive,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="cartavault-personal-data.zip"', "Cache-Control": "no-store"},
    )
