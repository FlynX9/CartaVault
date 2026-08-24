from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, insert, select
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.auth.models import User
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.maps.models import MapMembership, PoiMap
from app.places.models import Place, PlaceLink
from app.photos.models import Photo
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.statuses.models import PlaceStatus
from app.tags.associations import place_tags_table
from app.tags.models import Tag
from app.trips.models import Trip, TripArrival, TripDay, TripDeparture, TripNight, TripNightPhoto, TripStop


_AUDIT_COLUMNS = {"id", "created_at", "updated_at", "deleted_at", "deleted_by_user_id", "purge_after"}


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
    place_photos = list(session.scalars(select(Photo).where((Photo.map_id == map_id) | Photo.place_id.in_(place_ids)))) if place_ids else list(session.scalars(select(Photo).where(Photo.map_id == map_id)))
    night_photos = list(session.scalars(select(TripNightPhoto).join(TripNight).where(TripNight.trip_id.in_([trip.id for trip in trips])))) if trips else []

    quotas = QuotaService(session)
    quotas.ensure_can_create(user.id, QuotaKey.MAPS_MAX)
    quotas.ensure_can_create(user.id, QuotaKey.TRIPS_TOTAL_MAX, increment=len(trips))
    quotas.ensure_can_create(user.id, QuotaKey.PHOTOS_TOTAL_MAX, increment=len(place_photos) + len(night_photos))
    quotas.ensure_can_create(user.id, QuotaKey.STORAGE_BYTES_MAX, increment=sum(photo.file_size_bytes or 0 for photo in place_photos) + sum(photo.file_size_bytes for photo in night_photos))

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
        session.execute(insert(place_categories_table), [{"place_id": place_ids_by_old[row["place_id"]], "category_id": category_ids[row["category_id"]], "is_primary": row["is_primary"]} for row in category_rows])
        tag_rows = session.execute(select(place_tags_table).where(place_tags_table.c.place_id.in_(place_ids))).mappings()
        session.execute(insert(place_tags_table), [{"place_id": place_ids_by_old[row["place_id"]], "tag_id": tag_ids[row["tag_id"]]} for row in tag_rows])

    for old in places:
        new_place_id = place_ids_by_old[old.id]
        quotas.ensure_can_create(user.id, QuotaKey.PHOTOS_PER_PLACE_MAX, scope_id=new_place_id, increment=sum(photo.place_id == old.id for photo in place_photos))
        link_count = session.scalar(select(func.count()).select_from(PlaceLink).where(PlaceLink.place_id == old.id)) or 0
        quotas.ensure_can_create(user.id, QuotaKey.LINKS_PER_PLACE_MAX, scope_id=new_place_id, increment=int(link_count))
        for link in session.scalars(select(PlaceLink).where(PlaceLink.place_id == old.id)):
            _copy(link, PlaceLink, session, place_id=new_place_id)
        for photo in (photo for photo in place_photos if photo.place_id == old.id):
            _copy(photo, Photo, session, map_id=copied_map.id, place_id=new_place_id)
    for photo in (photo for photo in place_photos if photo.place_id is None):
        _copy(photo, Photo, session, map_id=copied_map.id, place_id=None)

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
                _copy(photo, TripNightPhoto, session, night_id=new_night.id)
        for model, field in ((TripDeparture, "departure"), (TripArrival, "arrival")):
            endpoint = session.scalar(select(model).where(model.trip_id == old_trip.id))
            if endpoint is not None:
                _copy(endpoint, model, session, trip_id=new_trip.id, place_id=place_ids_by_old.get(endpoint.place_id))
    return copied_map
