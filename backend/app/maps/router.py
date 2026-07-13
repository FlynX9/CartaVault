from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.countries.models import Country
from app.countries.schemas import CountrySummary
from app.database import get_db
from app.maps.models import PoiMap
from app.maps.schemas import MapCreate, MapRead, MapUpdate
from app.places.models import Place


router = APIRouter(prefix="/maps", tags=["maps"])


def map_to_read(poi_map: PoiMap) -> MapRead:
    country = poi_map.country
    return MapRead(
        id=poi_map.id,
        name=poi_map.name,
        country_id=poi_map.country_id,
        country=CountrySummary(
            id=country.id,
            iso_alpha2=country.iso_alpha2,
            iso_alpha3=country.iso_alpha3,
            name=country.name,
        ),
        center_latitude=poi_map.center_latitude,
        center_longitude=poi_map.center_longitude,
        default_zoom=poi_map.default_zoom,
        effective_center_latitude=poi_map.center_latitude if poi_map.center_latitude is not None else country.center_latitude,
        effective_center_longitude=poi_map.center_longitude if poi_map.center_longitude is not None else country.center_longitude,
        effective_default_zoom=poi_map.default_zoom if poi_map.default_zoom is not None else country.default_zoom,
        min_latitude=country.min_latitude,
        max_latitude=country.max_latitude,
        min_longitude=country.min_longitude,
        max_longitude=country.max_longitude,
        created_at=poi_map.created_at,
        updated_at=poi_map.updated_at,
    )


def read_map(database_session: Session, map_id: UUID) -> PoiMap | None:
    return database_session.scalar(
        select(PoiMap).options(joinedload(PoiMap.country)).where(PoiMap.id == map_id)
    )


@router.get("", response_model=list[MapRead])
def get_maps(
    q: str | None = Query(default=None, min_length=1, max_length=120),
    database_session: Session = Depends(get_db),
) -> list[MapRead]:
    statement = select(PoiMap).options(joinedload(PoiMap.country))
    if q is not None:
        statement = statement.where(PoiMap.name.ilike(f"%{q.strip()}%"))
    maps = database_session.scalars(statement.order_by(func.lower(PoiMap.name), PoiMap.id)).all()
    return [map_to_read(poi_map) for poi_map in maps]


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: UUID, database_session: Session = Depends(get_db)) -> MapRead:
    poi_map = read_map(database_session, map_id)
    if poi_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Map with id {map_id} was not found")
    return map_to_read(poi_map)


@router.post("", response_model=MapRead, status_code=status.HTTP_201_CREATED)
def create_map(map_data: MapCreate, database_session: Session = Depends(get_db)) -> MapRead:
    country = database_session.get(Country, map_data.country_id)
    if country is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Country with id {map_data.country_id} was not found")

    poi_map = PoiMap(
        country_id=country.id,
        name=map_data.name.strip() if map_data.name is not None else country.name,
        center_latitude=map_data.center_latitude,
        center_longitude=map_data.center_longitude,
        default_zoom=map_data.default_zoom,
    )
    try:
        database_session.add(poi_map)
        database_session.commit()
        result = read_map(database_session, poi_map.id)
        assert result is not None
        return map_to_read(result)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A map already exists for this country") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to create the map") from error


@router.patch("/{map_id}", response_model=MapRead)
def update_map(map_id: UUID, map_data: MapUpdate, database_session: Session = Depends(get_db)) -> MapRead:
    poi_map = database_session.get(PoiMap, map_id)
    if poi_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Map with id {map_id} was not found")

    supplied = map_data.model_dump(exclude_unset=True)
    if "name" in supplied:
        supplied["name"] = supplied["name"].strip()
    for field_name, value in supplied.items():
        setattr(poi_map, field_name, value)
    try:
        database_session.commit()
        result = read_map(database_session, map_id)
        assert result is not None
        return map_to_read(result)
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to update the map") from error


@router.delete("/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map(map_id: UUID, database_session: Session = Depends(get_db)) -> Response:
    poi_map = database_session.get(PoiMap, map_id)
    if poi_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Map with id {map_id} was not found")
    contains_places = database_session.scalar(select(func.count()).select_from(Place).where(Place.map_id == map_id))
    if contains_places:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The map cannot be deleted while it contains places")
    try:
        database_session.delete(poi_map)
        database_session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The map cannot be deleted while it contains places") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to delete the map") from error
