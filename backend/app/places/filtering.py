"""Validated, reusable filters for list and map place queries."""

from dataclasses import dataclass
from datetime import date, datetime, time
from uuid import UUID

from fastapi import HTTPException, Query, status
from sqlalchemy import Select, or_

from app.categories.models import Category
from app.countries.models import Country
from app.maps.models import PoiMap
from app.places.models import Place
from app.tags.models import Tag


@dataclass(frozen=True)
class PlaceFilters:
    query: str | None
    category_ids: tuple[UUID, ...]
    tag_ids: tuple[UUID, ...]
    status_ids: tuple[UUID, ...]
    regions: tuple[str, ...]
    has_photos: bool | None
    created_from: date | None
    created_to: date | None
    updated_from: date | None
    updated_to: date | None
    access_values: tuple[str, ...]
    danger_levels: tuple[str, ...]
    condition_values: tuple[str, ...]
    has_valid_coordinates: bool | None
    in_trip: bool | None


def get_place_filters(
    q: str | None = Query(default=None, min_length=1, max_length=100),
    category_ids: list[UUID] = Query(default=[]),
    tag_ids: list[UUID] = Query(default=[]),
    status_ids: list[UUID] = Query(default=[]),
    regions: list[str] = Query(default=[], max_length=100),
    has_photos: bool | None = Query(default=None),
    created_from: date | None = Query(default=None),
    created_to: date | None = Query(default=None),
    updated_from: date | None = Query(default=None),
    updated_to: date | None = Query(default=None),
    access_values: list[str] = Query(default=[], max_length=50),
    danger_levels: list[str] = Query(default=[], max_length=50),
    condition_values: list[str] = Query(default=[], max_length=50),
    has_valid_coordinates: bool | None = Query(default=None),
    in_trip: bool | None = Query(default=None),
) -> PlaceFilters:
    """Parse query parameters once; same-group values are ORed by SQL."""
    if created_from and created_to and created_from > created_to:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="created_from must not be after created_to")
    if updated_from and updated_to and updated_from > updated_to:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="updated_from must not be after updated_to")
    normalise = lambda values: tuple(dict.fromkeys(value.strip() for value in values if value.strip()))
    return PlaceFilters(
        query=q.strip() if q else None,
        category_ids=tuple(dict.fromkeys(category_ids)), tag_ids=tuple(dict.fromkeys(tag_ids)), status_ids=tuple(dict.fromkeys(status_ids)),
        regions=normalise(regions), has_photos=has_photos, created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to, access_values=normalise(access_values),
        danger_levels=normalise(danger_levels), condition_values=normalise(condition_values),
        has_valid_coordinates=has_valid_coordinates, in_trip=in_trip,
    )


def apply_place_filters(statement: Select[tuple[Place]], filters: PlaceFilters) -> Select[tuple[Place]]:
    """Apply AND across filter groups and OR within a group without raw SQL."""
    if filters.query:
        pattern = f"%{filters.query}%"
        statement = statement.where(or_(
            Place.name.ilike(pattern), Place.description.ilike(pattern), Place.region.ilike(pattern),
            Place.categories.any(Category.name.ilike(pattern)), Place.tags.any(Tag.name.ilike(pattern)),
            Place.map.has(PoiMap.country.has(Country.name.ilike(pattern))),
        ))
    if filters.category_ids: statement = statement.where(Place.categories.any(Category.id.in_(filters.category_ids)))
    if filters.tag_ids: statement = statement.where(Place.tags.any(Tag.id.in_(filters.tag_ids)))
    if filters.status_ids: statement = statement.where(Place.status_id.in_(filters.status_ids))
    if filters.regions: statement = statement.where(Place.region.in_(filters.regions))
    if filters.has_photos is not None: statement = statement.where(Place.photos.any() if filters.has_photos else ~Place.photos.any())
    if filters.created_from: statement = statement.where(Place.created_at >= datetime.combine(filters.created_from, time.min))
    if filters.created_to: statement = statement.where(Place.created_at < datetime.combine(filters.created_to, time.max))
    if filters.updated_from: statement = statement.where(Place.updated_at >= datetime.combine(filters.updated_from, time.min))
    if filters.updated_to: statement = statement.where(Place.updated_at < datetime.combine(filters.updated_to, time.max))
    if filters.access_values: statement = statement.where(Place.access.in_(filters.access_values))
    if filters.danger_levels: statement = statement.where(Place.danger_level.in_(filters.danger_levels))
    if filters.condition_values: statement = statement.where(Place.condition.in_(filters.condition_values))
    if filters.has_valid_coordinates is not None: statement = statement.where(Place.location.is_not(None) if filters.has_valid_coordinates else Place.location.is_(None))
    if filters.in_trip is not None: statement = statement.where(Place.trip_stops.any() if filters.in_trip else ~Place.trip_stops.any())
    return statement
