from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only, selectinload

from app.categories.models import Category
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.categories.associations import place_categories_table
from app.database import get_db
from app.places.filters import MapBounds, get_required_map_bounds
from app.places.filtering import PlaceFilters, apply_place_filters, get_place_filters
from app.places.map_schemas import (
    MapCategoryRead,
    PrimaryCategoryRead,
    MapStatusRead,
    MapTagRead,
    PlaceMapPageRead,
    PlaceMapRead,
)
from app.places.models import Place
from app.maps.models import MapMembership
from app.tags.models import Tag
from app.statuses.models import PlaceStatus


router = APIRouter(
    prefix="/places",
    tags=["places map"],
)


@router.get(
    "/map",
    response_model=list[PlaceMapRead] | PlaceMapPageRead,
)
def get_map_places(
    map_id: UUID | None = Query(
        default=None,
        description="Filter map markers by map UUID",
    ),
    category_id: UUID | None = Query(
        default=None,
        description="Filter map markers by category UUID",
    ),
    tag_id: UUID | None = Query(
        default=None,
        description="Filter map markers by tag UUID",
    ),
    status_id: UUID | None = Query(
        default=None,
        description="Filter map markers by tracking status UUID",
    ),
    limit: int = Query(
        default=1000,
        ge=1,
        le=5000,
        description="Maximum number of markers returned",
    ),
    include_meta: bool = Query(default=False, description="Return result count and truncation metadata"),
    map_bounds: MapBounds = Depends(get_required_map_bounds),
    filters: PlaceFilters = Depends(get_place_filters),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PlaceMapRead] | PlaceMapPageRead:
    """Return lightweight place markers inside the visible map area."""

    visible_area = func.ST_MakeEnvelope(
        map_bounds.min_longitude,
        map_bounds.min_latitude,
        map_bounds.max_longitude,
        map_bounds.max_latitude,
        4326,
    )

    statement = (
        select(
            Place,
            func.ST_X(Place.location).label("longitude"),
            func.ST_Y(Place.location).label("latitude"),
        )
        .options(
            load_only(
                Place.id,
                Place.name,
                Place.map_id,
            ),
            selectinload(Place.categories).load_only(
                Category.id,
                Category.name,
                Category.icon,
            ),
            selectinload(Place.tags).load_only(
                Tag.id,
                Tag.name,
            ),
            selectinload(Place.status).load_only(
                PlaceStatus.id,
                PlaceStatus.name,
                PlaceStatus.slug,
                PlaceStatus.color,
                PlaceStatus.is_active,
            ),
        )
        .where(
            Place.location.is_not(None),
            func.ST_Intersects(
                Place.location,
                visible_area,
            ),
        )
        .order_by(
            Place.name,
            Place.id,
        )
        .limit(limit)
    )

    if map_id is not None:
        require_map_role(database_session, map_id, current_user, "viewer")
    elif not current_user.is_admin:
        statement = statement.where(
            Place.map_id.in_(select(MapMembership.map_id).where(MapMembership.user_id == current_user.id))
        )

    statement = apply_place_filters(statement, filters)

    if category_id is not None:
        statement = statement.where(
            Place.categories.any(
                Category.id == category_id
            )
        )

    if map_id is not None:
        statement = statement.where(Place.map_id == map_id)

    if tag_id is not None:
        statement = statement.where(
            Place.tags.any(
                Tag.id == tag_id
            )
        )

    if status_id is not None:
        statement = statement.where(Place.status_id == status_id)

    total = database_session.scalar(statement.with_only_columns(func.count()).order_by(None).limit(None)) if include_meta else 0
    rows = database_session.execute(statement).all()
    place_ids = [place.id for place, _, _ in rows]
    primary_categories = {
        (place_id, category_id): is_primary
        for place_id, category_id, is_primary in database_session.execute(
            select(
                place_categories_table.c.place_id,
                place_categories_table.c.category_id,
                place_categories_table.c.is_primary,
            ).where(place_categories_table.c.place_id.in_(place_ids))
        )
    } if place_ids else {}

    items = [
        PlaceMapRead(
            id=place.id,
            map_id=place.map_id,
            name=place.name,
            longitude=longitude,
            latitude=latitude,
            status=MapStatusRead(
                id=place.status.id,
                name=place.status.name,
                slug=place.status.slug,
                color=place.status.color,
            ),
            primary_category=next((PrimaryCategoryRead(id=category.id, name=category.name, icon=category.icon) for category in place.categories if primary_categories.get((place.id, category.id), False)), None),
            categories=[MapCategoryRead(id=category.id, name=category.name, icon=category.icon, is_primary=primary_categories.get((place.id, category.id), False)) for category in place.categories],
            tags=[
                MapTagRead(
                    id=tag.id,
                    name=tag.name,
                )
                for tag in place.tags
            ],
        )
        for place, longitude, latitude in rows
    ]
    if include_meta:
        return PlaceMapPageRead(items=items, total=total or 0, returned=len(items), truncated=(total or 0) > len(items))
    return items
