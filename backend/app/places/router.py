from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.places.models import Place
from app.places.schemas import PlaceRead

router = APIRouter(
    prefix="/places",
    tags=["places"],
)


@router.get(
    "",
    response_model=list[PlaceRead],
)
def get_places(
    database_session: Session = Depends(get_db),
) -> list[PlaceRead]:
    """Return all registered places."""

    statement = (
        select(
            Place.id,
            Place.name,
            Place.description,
            Place.address,
            Place.country,
            Place.region,
            func.ST_X(Place.location).label("longitude"),
            func.ST_Y(Place.location).label("latitude"),
            Place.created_at,
            Place.updated_at,
        )
        .order_by(Place.created_at.desc())
    )

    rows = database_session.execute(statement).mappings().all()

    return [PlaceRead(**row) for row in rows]