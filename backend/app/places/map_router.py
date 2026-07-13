from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, load_only, selectinload

from app.categories.models import Category
from app.database import get_db
from app.places.filters import MapBounds, get_required_map_bounds
from app.places.map_schemas import MapCategoryRead, PlaceMapRead
from app.places.models import Place


router = APIRouter(
    prefix="/places",
    tags=["places map"],
)


@router.get(
    "/map",
    response_model=list[PlaceMapRead],
)
def get_map_places(
    category_id: UUID | None = Query(
        default=None,
        description="Filter map markers by category UUID",
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
        )
        for place, longitude, latitude in rows
    ]
