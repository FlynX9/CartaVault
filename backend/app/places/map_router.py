from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only, selectinload

from app.categories.models import Category
from app.database import get_db
from app.places.filters import MapBounds, get_required_map_bounds
from app.places.map_schemas import MapCategoryRead, MapTagRead, PlaceMapRead
from app.places.models import Place
from app.tags.models import Tag


router = APIRouter(
    prefix="/places",
    tags=["places map"],
)


@router.get(
    "/map",
    response_model=list[PlaceMapRead],
)
def get_map_places(
    country: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Filter map markers by country",
    ),
    category_id: UUID | None = Query(
        default=None,
        description="Filter map markers by category UUID",
    ),
    tag_id: UUID | None = Query(
        default=None,
        description="Filter map markers by tag UUID",
    ),
    limit: int = Query(
        default=1000,
        ge=1,
        le=5000,
        description="Maximum number of markers returned",
    ),
    map_bounds: MapBounds = Depends(get_required_map_bounds),
    database_session: Session = Depends(get_db),
) -> list[PlaceMapRead]:
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
            ),
            selectinload(Place.categories).load_only(
                Category.id,
                Category.name,
            ),
            selectinload(Place.tags).load_only(
                Tag.id,
                Tag.name,
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

    if category_id is not None:
        statement = statement.where(
            Place.categories.any(
                Category.id == category_id
            )
        )

    if country is not None:
        statement = statement.where(
            func.lower(Place.country) == country.strip().lower()
        )

    if tag_id is not None:
        statement = statement.where(
            Place.tags.any(
                Tag.id == tag_id
            )
        )

    rows = database_session.execute(statement).all()

    return [
        PlaceMapRead(
            id=place.id,
            name=place.name,
            longitude=longitude,
            latitude=latitude,
            categories=[
                MapCategoryRead(
                    id=category.id,
                    name=category.name,
                )
                for category in place.categories
            ],
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
