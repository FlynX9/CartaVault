from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.countries.models import Country
from app.countries.schemas import CountryRead
from app.database import get_db
from app.auth.dependencies import get_current_user


router = APIRouter(prefix="/countries", tags=["countries"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[CountryRead])
def get_countries(
    q: str | None = Query(default=None, min_length=1, max_length=120),
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    database_session: Session = Depends(get_db),
) -> list[Country]:
    """Search the versioned country catalogue."""

    statement = select(Country)
    if q is not None:
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(Country.name.ilike(pattern), Country.iso_alpha2.ilike(pattern), Country.iso_alpha3.ilike(pattern)))

    return list(database_session.scalars(statement.order_by(func.lower(Country.name), Country.id).offset(offset).limit(limit)))


@router.get("/{country_id}", response_model=CountryRead)
def get_country(country_id: UUID, database_session: Session = Depends(get_db)) -> Country:
    country = database_session.get(Country, country_id)
    if country is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {country_id} was not found")
    return country
