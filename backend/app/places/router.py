from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from app.categories.models import Category
from app.categories.schemas import CategoryRead
from app.database import get_db
from app.places.filters import MapBounds, get_map_bounds
from app.places.models import Place
from app.places.schemas import PlaceCreate, PlaceRead, PlaceUpdate
from app.tags.models import Tag
from app.tags.schemas import TagRead


router = APIRouter(
    prefix="/places",
    tags=["places"],
)


def build_place_read_statement():
    """Build the common query used to expose places through the API."""

    return (
        select(
            Place,
            func.ST_X(Place.location).label("longitude"),
            func.ST_Y(Place.location).label("latitude"),
        )
        .options(
            selectinload(Place.categories),
            selectinload(Place.tags),
        )
    )


def place_to_read(
    place: Place,
    longitude: float | None,
    latitude: float | None,
) -> PlaceRead:
    """Convert a SQLAlchemy place and its coordinates to an API schema."""

    return PlaceRead(
        id=place.id,
        name=place.name,
        description=place.description,
        address=place.address,
        country=place.country,
        region=place.region,
        construction_date=place.construction_date,
        abandonment_date=place.abandonment_date,
        condition=place.condition,
        access=place.access,
        danger_level=place.danger_level,
        owner=place.owner,
        longitude=longitude,
        latitude=latitude,
        categories=[
            CategoryRead(
                id=category.id,
                name=category.name,
                description=category.description,
            )
            for category in place.categories
        ],
        tags=[
            TagRead(
                id=tag.id,
                name=tag.name,
            )
            for tag in place.tags
        ],
        created_at=place.created_at,
        updated_at=place.updated_at,
    )


def read_place(
    database_session: Session,
    place_id: UUID,
) -> PlaceRead:
    """Read one place after a create, update or relationship change."""

    statement = build_place_read_statement().where(
        Place.id == place_id
    )

    row = database_session.execute(statement).one()

    place, longitude, latitude = row

    return place_to_read(
        place=place,
        longitude=longitude,
        latitude=latitude,
    )


@router.get(
    "",
    response_model=list[PlaceRead],
)
def get_places(
    q: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description=(
            "Case-insensitive search in the name, description and address"
        ),
    ),
    country: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Filter places by country",
    ),
    region: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Filter places by region",
    ),
    category_id: UUID | None = Query(
        default=None,
        description="Filter places by category UUID",
    ),
    tag_id: UUID | None = Query(
        default=None,
        description="Filter places by tag UUID",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description="Maximum number of places returned",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Number of places to skip",
    ),
    map_bounds: MapBounds | None = Depends(get_map_bounds),
    database_session: Session = Depends(get_db),
) -> list[PlaceRead]:
    """Return places using optional search, filters and pagination."""

    statement = build_place_read_statement()

    if q is not None:
        search_pattern = f"%{q.strip()}%"

        statement = statement.where(
            or_(
                Place.name.ilike(search_pattern),
                Place.description.ilike(search_pattern),
                Place.address.ilike(search_pattern),
            )
        )

    if country is not None:
        statement = statement.where(
            func.lower(Place.country) == country.strip().lower()
        )

    if region is not None:
        statement = statement.where(
            func.lower(Place.region) == region.strip().lower()
        )

    if category_id is not None:
        statement = statement.where(
            Place.categories.any(
                Category.id == category_id
            )
        )

    if tag_id is not None:
        statement = statement.where(
            Place.tags.any(
                Tag.id == tag_id
            )
        )

    if map_bounds is not None:
        visible_area = func.ST_MakeEnvelope(
            map_bounds.min_longitude,
            map_bounds.min_latitude,
            map_bounds.max_longitude,
            map_bounds.max_latitude,
            4326,
        )

        statement = statement.where(
            func.ST_Intersects(
                Place.location,
                visible_area,
            )
        )

    statement = (
        statement
        .order_by(Place.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    rows = database_session.execute(statement).all()

    return [
        place_to_read(
            place=place,
            longitude=longitude,
            latitude=latitude,
        )
        for place, longitude, latitude in rows
    ]


@router.get(
    "/{place_id}",
    response_model=PlaceRead,
)
def get_place(
    place_id: UUID,
    database_session: Session = Depends(get_db),
) -> PlaceRead:
    """Return one place by its UUID."""

    statement = build_place_read_statement().where(
        Place.id == place_id
    )

    row = database_session.execute(statement).one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    place, longitude, latitude = row

    return place_to_read(
        place=place,
        longitude=longitude,
        latitude=latitude,
    )


@router.post(
    "",
    response_model=PlaceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_place(
    place_data: PlaceCreate,
    database_session: Session = Depends(get_db),
) -> PlaceRead:
    """Create a new point of interest."""

    location = WKTElement(
        f"POINT({place_data.longitude} {place_data.latitude})",
        srid=4326,
    )

    place = Place(
        name=place_data.name,
        description=place_data.description,
        location=location,
        address=place_data.address,
        country=place_data.country,
        region=place_data.region,
        construction_date=place_data.construction_date,
        abandonment_date=place_data.abandonment_date,
        condition=place_data.condition,
        access=place_data.access,
        danger_level=place_data.danger_level,
        owner=place_data.owner,
    )

    try:
        database_session.add(place)
        database_session.commit()
        database_session.refresh(place)

        return read_place(
            database_session=database_session,
            place_id=place.id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the place",
        ) from error


@router.patch(
    "/{place_id}",
    response_model=PlaceRead,
)
def update_place(
    place_id: UUID,
    place_data: PlaceUpdate,
    database_session: Session = Depends(get_db),
) -> PlaceRead:
    """Partially update an existing place."""

    place = database_session.get(Place, place_id)

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    supplied_data = place_data.model_dump(exclude_unset=True)

    latitude = supplied_data.pop("latitude", None)
    longitude = supplied_data.pop("longitude", None)

    for field_name, field_value in supplied_data.items():
        setattr(place, field_name, field_value)

    if latitude is not None and longitude is not None:
        place.location = WKTElement(
            f"POINT({longitude} {latitude})",
            srid=4326,
        )

    try:
        database_session.commit()
        database_session.refresh(place)

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the place",
        ) from error


@router.delete(
    "/{place_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_place(
    place_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Delete an existing place."""

    place = database_session.get(Place, place_id)

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    try:
        database_session.delete(place)
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the place",
        ) from error


@router.post(
    "/{place_id}/categories/{category_id}",
    response_model=PlaceRead,
)
def add_category_to_place(
    place_id: UUID,
    category_id: UUID,
    database_session: Session = Depends(get_db),
) -> PlaceRead:
    """Assign a category to a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.categories),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    if category not in place.categories:
        place.categories.append(category)

    try:
        database_session.commit()

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to assign the category to the place",
        ) from error


@router.delete(
    "/{place_id}/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_category_from_place(
    place_id: UUID,
    category_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Remove a category from a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.categories),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    if category in place.categories:
        place.categories.remove(category)

    try:
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to remove the category from the place",
        ) from error


@router.post(
    "/{place_id}/tags/{tag_id}",
    response_model=PlaceRead,
)
def add_tag_to_place(
    place_id: UUID,
    tag_id: UUID,
    database_session: Session = Depends(get_db),
) -> PlaceRead:
    """Assign a tag to a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.tags),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    if tag not in place.tags:
        place.tags.append(tag)

    try:
        database_session.commit()

        return read_place(
            database_session=database_session,
            place_id=place_id,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to assign the tag to the place",
        ) from error


@router.delete(
    "/{place_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_tag_from_place(
    place_id: UUID,
    tag_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Remove a tag from a place."""

    place = database_session.get(
        Place,
        place_id,
        options=[
            selectinload(Place.tags),
        ],
    )

    if place is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    if tag in place.tags:
        place.tags.remove(tag)

    try:
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to remove the tag from the place",
        ) from error
