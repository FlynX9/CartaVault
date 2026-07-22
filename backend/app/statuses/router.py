import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role
from app.database import get_db
from app.places.models import Place
from app.statuses.models import PlaceStatus
from app.statuses.schemas import PlaceStatusCreate, PlaceStatusRead, PlaceStatusUpdate
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


router = APIRouter(prefix="/statuses", tags=["statuses"])


def slugify_status_name(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    if not slug:
        raise HTTPException(status_code=422, detail="The status name must contain at least one letter or number")
    return slug[:100].rstrip("-")


def build_status_read_statement():
    return (
        select(PlaceStatus, func.count(Place.id).label("places_count"))
        .outerjoin(Place, Place.status_id == PlaceStatus.id)
        .group_by(PlaceStatus.id)
    )


def status_to_read(place_status: PlaceStatus, places_count: int) -> PlaceStatusRead:
    return PlaceStatusRead(
        id=place_status.id,
        map_id=place_status.map_id,
        name=place_status.name,
        slug=place_status.slug,
        color=place_status.color,
        functional_state=place_status.functional_state,
        sort_order=place_status.sort_order,
        is_default=place_status.is_default,
        is_active=place_status.is_active,
        created_at=place_status.created_at,
        updated_at=place_status.updated_at,
        places_count=places_count,
    )


def read_status(database_session: Session, status_id: UUID) -> PlaceStatusRead:
    row = database_session.execute(
        build_status_read_statement().where(PlaceStatus.id == status_id)
    ).one()
    return status_to_read(*row)


def conflict_from_integrity(error: IntegrityError) -> HTTPException:
    constraint_name = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    detail = (
        "A status with this name already exists on this map"
        if constraint_name == "place_statuses_map_slug_key"
        else "The status conflicts with existing data"
    )
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.get("", response_model=list[PlaceStatusRead])
def get_statuses(
    map_id: UUID,
    q: str | None = Query(default=None, min_length=1, max_length=100),
    active_only: bool = Query(default=False),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PlaceStatusRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    statement = build_status_read_statement().where(PlaceStatus.map_id == map_id)
    if q is not None:
        pattern = f"%{q.strip()}%"
        statement = statement.where(PlaceStatus.name.ilike(pattern) | PlaceStatus.slug.ilike(pattern))
    if active_only:
        statement = statement.where(PlaceStatus.is_active.is_(True))
    statement = statement.order_by(PlaceStatus.sort_order, func.lower(PlaceStatus.name), PlaceStatus.id)
    return [status_to_read(*row) for row in database_session.execute(statement)]


@router.get("/{status_id}", response_model=PlaceStatusRead)
def get_status(
    status_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceStatusRead:
    place_status = database_session.get(PlaceStatus, status_id)
    if place_status is None:
        raise HTTPException(status_code=404, detail="Status not found")
    require_map_role(database_session, place_status.map_id, current_user, "viewer")
    return read_status(database_session, status_id)


@router.post("", response_model=PlaceStatusRead, status_code=201)
def create_status(
    status_data: PlaceStatusCreate,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceStatusRead:
    require_map_role(database_session, status_data.map_id, current_user, "editor")
    QuotaService(database_session).ensure_can_create(current_user.id, QuotaKey.STATUSES_PER_MAP_MAX, scope_id=status_data.map_id)
    place_status = PlaceStatus(
        map_id=status_data.map_id,
        name=status_data.name,
        slug=slugify_status_name(status_data.name),
        color=status_data.color,
        functional_state=status_data.functional_state,
        sort_order=status_data.sort_order,
        is_default=status_data.is_default,
        is_active=status_data.is_active,
    )
    try:
        if place_status.is_default:
            database_session.execute(
                update(PlaceStatus)
                .where(PlaceStatus.map_id == status_data.map_id, PlaceStatus.is_default.is_(True))
                .values(is_default=False)
            )
        database_session.add(place_status)
        database_session.commit()
        return read_status(database_session, place_status.id)
    except IntegrityError as error:
        database_session.rollback()
        raise conflict_from_integrity(error) from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to create the status") from error


@router.patch("/{status_id}", response_model=PlaceStatusRead)
def update_status(
    status_id: UUID,
    status_data: PlaceStatusUpdate,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlaceStatusRead:
    place_status = database_session.get(PlaceStatus, status_id)
    if place_status is None:
        raise HTTPException(status_code=404, detail="Status not found")
    require_map_role(database_session, place_status.map_id, current_user, "editor")
    supplied = status_data.model_dump(exclude_unset=True)
    becoming_default = supplied.get("is_default") is True
    resulting_default = becoming_default or place_status.is_default
    resulting_active = supplied.get("is_active", place_status.is_active)
    if resulting_default and not resulting_active:
        raise HTTPException(status_code=409, detail="The default status cannot be inactive")
    if place_status.is_default and supplied.get("is_default") is False:
        raise HTTPException(status_code=409, detail="A default status must always exist")
    if "name" in supplied:
        supplied["slug"] = slugify_status_name(supplied["name"])
    try:
        if becoming_default:
            database_session.execute(
                update(PlaceStatus)
                .where(
                    PlaceStatus.map_id == place_status.map_id,
                    PlaceStatus.id != status_id,
                    PlaceStatus.is_default.is_(True),
                )
                .values(is_default=False)
            )
        for field_name, field_value in supplied.items():
            setattr(place_status, field_name, field_value)
        database_session.commit()
        return read_status(database_session, status_id)
    except IntegrityError as error:
        database_session.rollback()
        raise conflict_from_integrity(error) from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the status") from error


@router.delete("/{status_id}", status_code=204)
def delete_status(
    status_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    place_status = database_session.get(PlaceStatus, status_id)
    if place_status is None:
        raise HTTPException(status_code=404, detail="Status not found")
    require_map_role(database_session, place_status.map_id, current_user, "editor")
    if place_status.is_default:
        raise HTTPException(status_code=409, detail="The default status cannot be deleted")
    if database_session.scalar(select(func.count(Place.id)).where(Place.status_id == status_id)):
        raise HTTPException(status_code=409, detail="A status used by places cannot be deleted")
    try:
        database_session.delete(place_status)
        database_session.commit()
        return Response(status_code=204)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A status used by places cannot be deleted") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to delete the status") from error
