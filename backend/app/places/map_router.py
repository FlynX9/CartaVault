from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only, selectinload

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.categories.associations import place_categories_table
from app.categories.models import Category
from app.database import get_db
from app.maps.models import MapMembership
from app.places.filtering import PlaceFilters, apply_place_filters, get_place_filters, place_ordering
from app.places.filters import MapBounds, get_required_map_bounds
from app.places.map_schemas import MapStatusRead, PlaceMapPageRead, PlaceMapRead
from app.places.models import Place
from app.photos.models import Photo
from app.statuses.models import PlaceStatus
from app.tags.associations import place_tags_table
from app.tags.models import Tag


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
                Place.is_favorite,
            ),
            selectinload(Place.status).load_only(
                PlaceStatus.id,
                PlaceStatus.color,
            ),
        )
        .where(
            Place.location.is_not(None),
            func.ST_Intersects(
                Place.location,
                visible_area,
            ),
        )
        .order_by(*place_ordering(filters))
        .limit(limit)
    )

    if map_id is not None:
        require_map_role(database_session, map_id, current_user, "viewer")
    else:
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
    category_rows = database_session.execute(
            select(
                place_categories_table.c.place_id,
                place_categories_table.c.category_id,
                place_categories_table.c.is_primary,
                Category.icon,
            )
            .join(Category, Category.id == place_categories_table.c.category_id)
            .where(place_categories_table.c.place_id.in_(place_ids))
            .order_by(place_categories_table.c.place_id, place_categories_table.c.category_id)
        ).all() if place_ids else []
    category_ids: dict[UUID, list[UUID]] = {}
    primary_category_icons: dict[UUID, str] = {}
    for place_id, category_id, is_primary, icon in category_rows:
        category_ids.setdefault(place_id, []).append(category_id)
        if is_primary:
            primary_category_icons[place_id] = icon

    tag_ids: dict[UUID, list[UUID]] = {}
    tag_rows = database_session.execute(
        select(place_tags_table.c.place_id, place_tags_table.c.tag_id)
        .where(place_tags_table.c.place_id.in_(place_ids))
        .order_by(place_tags_table.c.place_id, place_tags_table.c.tag_id)
    ).all() if place_ids else []
    for place_id, tag_id in tag_rows:
        tag_ids.setdefault(place_id, []).append(tag_id)

    primary_photo_ids = dict(database_session.execute(
        select(Photo.place_id, Photo.id)
        .where(Photo.place_id.in_(place_ids))
        .distinct(Photo.place_id)
        .order_by(Photo.place_id, Photo.is_primary.desc(), Photo.sort_order, Photo.id)
    ).all()) if place_ids else {}

    items = [
        PlaceMapRead(
            id=place.id,
            map_id=place.map_id,
            name=place.name,
            longitude=longitude,
            latitude=latitude,
            status=MapStatusRead(
                id=place.status.id,
                color=place.status.color,
            ),
            primary_category_icon=primary_category_icons.get(place.id),
            primary_photo_id=primary_photo_ids.get(place.id),
            category_ids=category_ids.get(place.id, []),
            tag_ids=tag_ids.get(place.id, []),
            is_favorite=place.is_favorite,
        )
        for place, longitude, latitude in rows
    ]
    if include_meta:
        return PlaceMapPageRead(items=items, total=total or 0, returned=len(items), truncated=(total or 0) > len(items))
    return items
