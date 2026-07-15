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
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.categories.models import Category
from app.categories.associations import place_categories_table
from app.categories.schemas import CategoryRead
from app.database import get_db
from app.countries.schemas import CountrySummary
from app.maps.models import PoiMap
from app.maps.schemas import MapSummary
from app.places.filters import MapBounds, get_map_bounds
from app.places.models import Place
from app.places.schemas import PlaceCategoryRead, PlaceCreate, PlaceRead, PlaceUpdate
from app.tags.models import Tag
from app.tags.schemas import TagRead
from app.statuses.models import PlaceStatus
from app.statuses.schemas import PlaceStatusSummary


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
            joinedload(Place.map).joinedload(PoiMap.country),
            joinedload(Place.status),
            selectinload(Place.categories),
            selectinload(Place.tags),
        )
    )


def place_to_read(
    place: Place,
    longitude: float | None,
    latitude: float | None,
    database_session: Session,
) -> PlaceRead:
    """Convert a SQLAlchemy place and its coordinates to an API schema."""

    return PlaceRead(
        id=place.id,
        name=place.name,
        map_id=place.map_id,
        map=MapSummary(
            id=place.map.id,
            name=place.map.name,
            country=CountrySummary(
                id=place.map.country.id,
                iso_alpha2=place.map.country.iso_alpha2,
                iso_alpha3=place.map.country.iso_alpha3,
                name=place.map.country.name,
            ),
        ),
        status=PlaceStatusSummary(
            id=place.status.id,
            name=place.status.name,
            slug=place.status.slug,
            color=place.status.color,
            is_active=place.status.is_active,
        ),
        description=place.description,
        region=place.region,
        construction_date=place.construction_date,
        abandonment_date=place.abandonment_date,
        condition=place.condition,
        access=place.access,
        danger_level=place.danger_level,
        custom_fields=place.custom_fields,
        longitude=longitude,
        latitude=latitude,
        categories=[
            PlaceCategoryRead(
                id=category.id,
                name=category.name,
                description=category.description,
                icon=category.icon,
                is_primary=bool(database_session.scalar(select(place_categories_table.c.is_primary).where(place_categories_table.c.place_id == place.id, place_categories_table.c.category_id == category.id))),
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
        database_session=database_session,
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
            "Case-insensitive search in the name and description"
        ),
    ),
    map_id: UUID | None = Query(
        default=None,
        description="Filter places by map UUID",
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
    status_id: UUID | None = Query(
        default=None,
        description="Filter places by tracking status UUID",
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
            )
        )

    if map_id is not None:
        statement = statement.where(Place.map_id == map_id)

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

    if status_id is not None:
        statement = statement.where(Place.status_id == status_id)

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
            database_session=database_session,
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
        database_session=database_session,
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

    if database_session.get(PoiMap, place_data.map_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {place_data.map_id} was not found",
        )

    if place_data.status_id is None:
        place_status = database_session.scalar(
            select(PlaceStatus).where(PlaceStatus.is_default.is_(True))
        )
        if place_status is None:
            raise HTTPException(status_code=409, detail="No default place status is configured")
    else:
        place_status = database_session.get(PlaceStatus, place_data.status_id)
        if place_status is None:
            raise HTTPException(
                status_code=404,
                detail=f"Status with id {place_data.status_id} was not found",
            )
        if not place_status.is_active:
            raise HTTPException(status_code=409, detail="An inactive status cannot be selected")

    location = WKTElement(
        f"POINT({place_data.longitude} {place_data.latitude})",
        srid=4326,
    )

    place = Place(
        name=place_data.name,
        map_id=place_data.map_id,
        status_id=place_status.id,
        description=place_data.description,
        location=location,
        region=place_data.region,
        construction_date=place_data.construction_date,
        abandonment_date=place_data.abandonment_date,
        condition=place_data.condition,
        access=place_data.access,
        danger_level=place_data.danger_level,
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

    requested_map_id = supplied_data.get("map_id")
    if requested_map_id is not None and database_session.get(
        PoiMap,
        requested_map_id,
    ) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Map with id {requested_map_id} was not found",
        )

    requested_status_id = supplied_data.get("status_id")
    if requested_status_id is not None:
        requested_status = database_session.get(PlaceStatus, requested_status_id)
        if requested_status is None:
            raise HTTPException(
                status_code=404,
                detail=f"Status with id {requested_status_id} was not found",
            )
        if not requested_status.is_active:
            raise HTTPException(status_code=409, detail="An inactive status cannot be selected")

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
        database_session.flush()
        if database_session.scalar(select(func.count()).select_from(place_categories_table).where(place_categories_table.c.place_id == place_id)) == 1:
            database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id).values(is_primary=True))

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
        was_primary = database_session.scalar(select(place_categories_table.c.is_primary).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id))
        place.categories.remove(category)
        database_session.flush()
        if was_primary:
            replacement = database_session.scalar(select(place_categories_table.c.category_id).where(place_categories_table.c.place_id == place_id).order_by(place_categories_table.c.category_id).limit(1))
            if replacement is not None:
                database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == replacement).values(is_primary=True))

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


@router.patch("/{place_id}/categories/{category_id}", response_model=PlaceRead)
def set_primary_category(place_id: UUID, category_id: UUID, database_session: Session = Depends(get_db)) -> PlaceRead:
    """Atomically select an already-associated primary category."""
    if database_session.get(Place, place_id) is None:
        raise HTTPException(status_code=404, detail=f"Place with id {place_id} was not found")
    if database_session.get(Category, category_id) is None:
        raise HTTPException(status_code=404, detail=f"Category with id {category_id} was not found")
    if database_session.scalar(select(place_categories_table.c.category_id).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id)) is None:
        raise HTTPException(status_code=404, detail="Category is not assigned to the place")
    try:
        database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id).values(is_primary=False))
        database_session.execute(update(place_categories_table).where(place_categories_table.c.place_id == place_id, place_categories_table.c.category_id == category_id).values(is_primary=True))
        database_session.commit()
        return read_place(database_session, place_id)
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the primary category") from error


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
