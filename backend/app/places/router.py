from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.places.models import Place
from app.places.schemas import PlaceCreate, PlaceRead, PlaceUpdate


router = APIRouter(
    prefix="/places",
    tags=["places"],
)


def build_place_read_statement():
    """Build the common query used to expose places through the API."""

    return select(
        Place.id,
        Place.name,
        Place.description,
        Place.address,
        Place.country,
        Place.region,
        Place.construction_date,
        Place.abandonment_date,
        Place.condition,
        Place.access,
        Place.danger_level,
        Place.owner,
        func.ST_X(Place.location).label("longitude"),
        func.ST_Y(Place.location).label("latitude"),
        Place.created_at,
        Place.updated_at,
    )


@router.get(
    "",
    response_model=list[PlaceRead],
)
def get_places(
    database_session: Session = Depends(get_db),
) -> list[PlaceRead]:
    """Return all registered places."""

    statement = build_place_read_statement().order_by(
        Place.created_at.desc()
    )

    rows = database_session.execute(statement).mappings().all()

    return [PlaceRead(**row) for row in rows]


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

    row = database_session.execute(statement).mappings().one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    return PlaceRead(**row)


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

        statement = build_place_read_statement().where(
            Place.id == place.id
        )

        row = database_session.execute(statement).mappings().one()

        return PlaceRead(**row)

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

        statement = build_place_read_statement().where(
            Place.id == place_id
        )

        row = database_session.execute(statement).mappings().one()

        return PlaceRead(**row)

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the place",
        ) from error