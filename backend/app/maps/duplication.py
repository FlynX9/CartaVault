from __future__ import annotations

import logging
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import and_, func, insert, or_, select
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.auth.models import User
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.maps.models import MapMembership, PoiMap
from app.places.models import Place, PlaceLink
from app.photos.models import Photo
from app.photos.storage import PhotoStorageError, copy_photo_file, delete_photo_file
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.statuses.models import PlaceStatus
from app.tags.associations import place_tags_table
from app.tags.models import Tag
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop


logger = logging.getLogger(__name__)

_AUDIT_COLUMNS = {"id", "created_at", "updated_at", "deleted_at", "deleted_by_user_id", "purge_after"}

# One entry per physical media file created by the duplication, carrying the
# minimal information required by ``delete_photo_file`` for a safe cleanup.
CreatedMediaFile = tuple[str, UUID, UUID]


def _values(instance: Any, *excluded: str) -> dict[str, Any]:
    excluded_columns = _AUDIT_COLUMNS | set(excluded)
    return {
        attribute.key: getattr(instance, attribute.key)
        for attribute in inspect(instance).mapper.column_attrs
        if attribute.key not in excluded_columns
    }


def _copy(instance: Any, model: type[Any], session: Session, **overrides: Any) -> Any:
    copied = model(**_values(instance, *overrides.keys()), **overrides)
    session.add(copied)
    session.flush()
    return copied


def _discard_created_media(created_media_files: list[CreatedMediaFile]) -> None:
    """Best-effort storage compensation; never masks the original failure."""

    for relative_path, scope_id, media_id in reversed(created_media_files):
        try:
            delete_photo_file(relative_path, scope_id, media_id)
        except Exception:
            logger.warning(
                "Unable to clean up duplicated media %s during rollback",
                relative_path,
                exc_info=True,
            )


def _copy_physical_media(
    source_path: str,
    source_scope_id: UUID,
    source_photo_id: UUID,
    *,
    target_scope_id: UUID,
    target_photo_id: UUID,
) -> tuple[str, str, int]:
    try:
        copied = copy_photo_file(
            source_path,
            source_scope_id,
            source_photo_id,
            target_scope_id=target_scope_id,
            target_photo_id=target_photo_id,
        )
    except PhotoStorageError as error:
        raise HTTPException(status_code=500, detail="Unable to duplicate the map media") from error
    return copied.relative_path, copied.media_type, copied.file_size_bytes


def _duplicate_place_photo(photo: Photo, session: Session, copied_map: PoiMap, new_place_id: UUID) -> CreatedMediaFile | None:
    """Copy one place-attached photo with its own physical file."""

    new_photo_id = uuid4()
    overrides: dict[str, Any] = {
        "id": new_photo_id,
        "map_id": copied_map.id,
        "place_id": new_place_id,
        # Attached copies follow the normal Place upload convention.
        "storage_scope_id": new_place_id,
    }
    if photo.path is not None:
        source_scope_id = photo.storage_scope_id
        if source_scope_id is None:
            raise HTTPException(status_code=500, detail="Unable to duplicate the map media")
        relative_path, media_type, file_size_bytes = _copy_physical_media(
            photo.path,
            source_scope_id,
            photo.id,
            target_scope_id=new_place_id,
            target_photo_id=new_photo_id,
        )
        overrides.update(path=relative_path, mime_type=media_type, file_size_bytes=file_size_bytes)
    _copy(photo, Photo, session, **overrides)
    return (overrides["path"], new_place_id, new_photo_id) if photo.path is not None else None


def _duplicate_orphan_photo(photo: Photo, session: Session, copied_map: PoiMap) -> CreatedMediaFile | None:
    """Copy one map-scoped orphan photo following the unattached upload convention."""

    new_photo_id = uuid4()
    overrides: dict[str, Any] = {
        "id": new_photo_id,
        "map_id": copied_map.id,
        "place_id": None,
        # Unattached media uploads own their storage directory.
        "storage_scope_id": new_photo_id,
    }
    if photo.path is not None:
        source_scope_id = photo.storage_scope_id
        if source_scope_id is None:
            raise HTTPException(status_code=500, detail="Unable to duplicate the map media")
        relative_path, media_type, file_size_bytes = _copy_physical_media(
            photo.path,
            source_scope_id,
            photo.id,
            target_scope_id=new_photo_id,
            target_photo_id=new_photo_id,
        )
        overrides.update(path=relative_path, mime_type=media_type, file_size_bytes=file_size_bytes)
    _copy(photo, Photo, session, **overrides)
    return (overrides["path"], new_photo_id, new_photo_id) if photo.path is not None else None


def _duplicate_night_photo(photo: TripNightPhoto, session: Session, new_night_id: UUID) -> CreatedMediaFile:
    """Copy one trip-night photo into the copied night's storage scope."""

    new_photo_id = uuid4()
    relative_path, media_type, file_size_bytes = _copy_physical_media(
        photo.file_path,
        photo.night_id,
        photo.id,
        target_scope_id=new_night_id,
        target_photo_id=new_photo_id,
    )
    _copy(
        photo,
        TripNightPhoto,
        session,
        id=new_photo_id,
        night_id=new_night_id,
        file_path=relative_path,
        mime_type=media_type,
        file_size_bytes=file_size_bytes,
    )
    return (relative_path, new_night_id, new_photo_id)


def duplicate_map(session: Session, map_id: UUID, user: User, name: str) -> PoiMap:
    source = session.scalar(select(PoiMap).where(PoiMap.id == map_id, PoiMap.deleted_at.is_(None)))
    if source is None:
        raise HTTPException(status_code=404, detail="Map not found")

    places = list(session.scalars(select(Place).where(Place.map_id == map_id, Place.deleted_at.is_(None))))
    categories = list(session.scalars(select(Category).where(Category.map_id == map_id)))
    tags = list(session.scalars(select(Tag).where(Tag.map_id == map_id)))
    statuses = list(session.scalars(select(PlaceStatus).where(PlaceStatus.map_id == map_id)))
    trips = list(session.scalars(select(Trip).where(Trip.map_id == map_id, Trip.deleted_at.is_(None))))
    place_ids = [place.id for place in places]
    # Only media that will actually be copied are eligible: photos of active
    # places plus map-scoped orphans. Photos belonging to soft-deleted places
    # must neither be copied nor counted in the quota increments.
    photo_conditions = [and_(Photo.place_id.is_(None), Photo.map_id == map_id)]
    if place_ids:
        photo_conditions.append(Photo.place_id.in_(place_ids))
    place_photos = list(session.scalars(select(Photo).where(or_(*photo_conditions))))
    night_photos = list(session.scalars(select(TripNightPhoto).join(TripNight).where(TripNight.trip_id.in_([trip.id for trip in trips])))) if trips else []

    quotas = QuotaService(session)
    quotas.ensure_can_create(user.id, QuotaKey.MAPS_MAX)
    quotas.ensure_can_create(user.id, QuotaKey.TRIPS_TOTAL_MAX, increment=len(trips))
    quotas.ensure_can_create(user.id, QuotaKey.PHOTOS_TOTAL_MAX, increment=len(place_photos) + len(night_photos))
    quotas.ensure_can_create(user.id, QuotaKey.STORAGE_BYTES_MAX, increment=sum(photo.file_size_bytes or 0 for photo in place_photos) + sum(photo.file_size_bytes for photo in night_photos))

    # Physical media copies are not transactional with PostgreSQL: track every
    # created file so a failure can roll the database back and compensate the
    # storage side in reverse order without masking the original error.
    created_media_files: list[CreatedMediaFile] = []
    try:
        copied_map = PoiMap(
            name=name,
            country_id=source.country_id,
            owner_id=user.id,
            is_private=source.is_private,
            center_latitude=source.center_latitude,
            center_longitude=source.center_longitude,
            default_zoom=source.default_zoom,
            place_field_config=dict(source.place_field_config or {}),
        )
        session.add(copied_map)
        session.flush()
        session.add(MapMembership(map_id=copied_map.id, user_id=user.id, role="owner"))

        for items, quota in (
            (categories, QuotaKey.CATEGORIES_PER_MAP_MAX),
            (tags, QuotaKey.TAGS_PER_MAP_MAX),
            (statuses, QuotaKey.STATUSES_PER_MAP_MAX),
        ):
            quotas.ensure_can_create(user.id, quota, scope_id=copied_map.id, increment=len(items))
        quotas.ensure_can_create(user.id, QuotaKey.PLACES_PER_MAP_MAX, scope_id=copied_map.id, increment=len(places))
        quotas.ensure_can_create(user.id, QuotaKey.TRIPS_PER_MAP_MAX, scope_id=copied_map.id, increment=len(trips))

        category_ids = {old.id: _copy(old, Category, session, map_id=copied_map.id).id for old in categories}
        tag_ids = {old.id: _copy(old, Tag, session, map_id=copied_map.id).id for old in tags}
        status_ids = {old.id: _copy(old, PlaceStatus, session, map_id=copied_map.id).id for old in statuses}
        place_ids_by_old = {old.id: _copy(old, Place, session, map_id=copied_map.id, status_id=status_ids[old.status_id]).id for old in places}

        if places:
            category_rows = session.execute(select(place_categories_table).where(place_categories_table.c.place_id.in_(place_ids))).mappings()
            category_associations = [{"place_id": place_ids_by_old[row["place_id"]], "category_id": category_ids[row["category_id"]], "is_primary": row["is_primary"]} for row in category_rows]
            if category_associations:
                session.execute(insert(place_categories_table), category_associations)
            tag_rows = session.execute(select(place_tags_table).where(place_tags_table.c.place_id.in_(place_ids))).mappings()
            tag_associations = [{"place_id": place_ids_by_old[row["place_id"]], "tag_id": tag_ids[row["tag_id"]]} for row in tag_rows]
            if tag_associations:
                session.execute(insert(place_tags_table), tag_associations)

        for old in places:
            new_place_id = place_ids_by_old[old.id]
            quotas.ensure_can_create(user.id, QuotaKey.PHOTOS_PER_PLACE_MAX, scope_id=new_place_id, increment=sum(photo.place_id == old.id for photo in place_photos))
            link_count = session.scalar(select(func.count()).select_from(PlaceLink).where(PlaceLink.place_id == old.id)) or 0
            quotas.ensure_can_create(user.id, QuotaKey.LINKS_PER_PLACE_MAX, scope_id=new_place_id, increment=int(link_count))
            for link in session.scalars(select(PlaceLink).where(PlaceLink.place_id == old.id)):
                _copy(link, PlaceLink, session, place_id=new_place_id)
            for photo in (photo for photo in place_photos if photo.place_id == old.id):
                created_file = _duplicate_place_photo(photo, session, copied_map, new_place_id)
                if created_file is not None:
                    created_media_files.append(created_file)
        for photo in (photo for photo in place_photos if photo.place_id is None):
            created_file = _duplicate_orphan_photo(photo, session, copied_map)
            if created_file is not None:
                created_media_files.append(created_file)

        template_ids = {old.id: _copy(old, AnnotationTemplate, session, map_id=copied_map.id).id for old in session.scalars(select(AnnotationTemplate).where(AnnotationTemplate.map_id == map_id))}
        if place_ids:
            for annotation in session.scalars(select(PlaceAnnotation).where(PlaceAnnotation.place_id.in_(place_ids))):
                _copy(annotation, PlaceAnnotation, session, place_id=place_ids_by_old[annotation.place_id], template_id=template_ids[annotation.template_id])

        for old_trip in trips:
            new_trip = _copy(old_trip, Trip, session, map_id=copied_map.id, created_by_user_id=user.id)
            day_ids: dict[UUID, UUID] = {}
            old_days = list(session.scalars(select(TripDay).where(TripDay.trip_id == old_trip.id).order_by(TripDay.sort_order)))
            quotas.ensure_can_create(user.id, QuotaKey.DAYS_PER_TRIP_MAX, scope_id=new_trip.id, increment=len(old_days))
            for old_day in old_days:
                day_ids[old_day.id] = _copy(old_day, TripDay, session, trip_id=new_trip.id).id
                old_stops = list(session.scalars(select(TripStop).where(TripStop.trip_day_id == old_day.id).order_by(TripStop.sort_order)))
                quotas.ensure_can_create(user.id, QuotaKey.STEPS_PER_DAY_MAX, scope_id=day_ids[old_day.id], increment=len(old_stops))
                for old_stop in old_stops:
                    _copy(old_stop, TripStop, session, trip_day_id=day_ids[old_day.id], place_id=place_ids_by_old.get(old_stop.place_id))
            for old_night in session.scalars(select(TripNight).where(TripNight.trip_id == old_trip.id)):
                new_night = _copy(old_night, TripNight, session, trip_id=new_trip.id, previous_day_id=day_ids[old_night.previous_day_id], next_day_id=day_ids[old_night.next_day_id], place_id=place_ids_by_old.get(old_night.place_id))
                for photo in session.scalars(select(TripNightPhoto).where(TripNightPhoto.night_id == old_night.id)):
                    created_media_files.append(_duplicate_night_photo(photo, session, new_night.id))
            for model, field in ((TripDeparture, "departure"), (TripArrival, "arrival")):
                endpoint = session.scalar(select(model).where(model.trip_id == old_trip.id))
                if endpoint is not None:
                    _copy(endpoint, model, session, trip_id=new_trip.id, place_id=place_ids_by_old.get(endpoint.place_id))
        return copied_map
    except BaseException:
        session.rollback()
        _discard_created_media(created_media_files)
        raise
