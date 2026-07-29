from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.countries.models import Country
from app.countries.schemas import CountryBoundaryRead, CountryRead
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.countries.display_boundary import load_display_boundaries


router = APIRouter(prefix="/countries", tags=["countries"], dependencies=[Depends(get_current_user)])
COUNTRY_BOUNDARY_DATA_VERSION = "10m-v2"


def _boundary_headers(country_code: str) -> dict[str, str]:
    return {
        "Cache-Control": "private, max-age=86400",
        "ETag": f'"country-boundary-{country_code.lower()}-{COUNTRY_BOUNDARY_DATA_VERSION}"',
    }


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


@router.get("/{country_id}/boundary", response_model=CountryBoundaryRead)
def get_country_boundary(
    country_id: UUID,
    response: Response,
    database_session: Session = Depends(get_db),
    if_none_match: str | None = Header(default=None),
) -> CountryBoundaryRead | Response:
    """Return the compact multi-territory geometry used by map overlays."""

    country = database_session.get(Country, country_id)
    if country is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {country_id} was not found")
    headers = _boundary_headers(country.iso_alpha3)
    if if_none_match == headers["ETag"]:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    polygons = load_display_boundaries().get(country.iso_alpha3)
    if not polygons:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Country boundary is unavailable")
    response.headers.update(headers)
    return CountryBoundaryRead(
        country_id=country.id,
        iso_alpha3=country.iso_alpha3,
        geometry={"type": "MultiPolygon", "coordinates": polygons},
        point_count=sum(len(ring) for polygon in polygons for ring in polygon),
    )
