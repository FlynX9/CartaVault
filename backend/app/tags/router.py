from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_tag_role
from app.database import get_db
from app.places.models import Place
from app.tags.models import Tag
from app.tags.schemas import TagCreate, TagRead, TagUpdate
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService

router = APIRouter(prefix="/tags", tags=["tags"])


def _read(tag: Tag, places_count: int = 0) -> TagRead:
    return TagRead.model_validate(tag, from_attributes=True).model_copy(update={"places_count": places_count})


def _read_statement():
    return (
        select(
            Tag,
            func.count(Place.id).filter(Place.deleted_at.is_(None)).label("places_count"),
        )
        .outerjoin(Tag.places)
        .group_by(Tag.id)
    )


def _read_tag(database_session: Session, tag: Tag) -> TagRead:
    row = database_session.execute(_read_statement().where(Tag.id == tag.id)).one()
    return _read(*row)


@router.get("", response_model=list[TagRead])
def get_tags(map_id: UUID = Query(), q: str | None = Query(default=None, min_length=1, max_length=100), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TagRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    statement = _read_statement().where(Tag.map_id == map_id)
    if q is not None:
        statement = statement.where(Tag.name.ilike(f"%{q.strip()}%"))
    return [_read(*row) for row in database_session.execute(statement.order_by(func.lower(Tag.name), Tag.id)).all()]


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TagRead:
    return _read_tag(database_session, require_tag_role(database_session, tag_id, current_user, "viewer"))


@router.post("", response_model=TagRead, status_code=201)
def create_tag(data: TagCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TagRead:
    require_map_role(database_session, data.map_id, current_user, "editor")
    QuotaService(database_session).ensure_can_create(current_user.id, QuotaKey.TAGS_PER_MAP_MAX, scope_id=data.map_id)
    tag = Tag(map_id=data.map_id, name=data.name, color=data.color)
    try:
        database_session.add(tag)
        database_session.commit()
        database_session.refresh(tag)
        return _read(tag)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A tag with this name already exists in this map") from error


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: UUID, data: TagUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TagRead:
    tag = require_tag_role(database_session, tag_id, current_user, "editor")
    supplied = data.model_dump(exclude_unset=True)
    if "name" in supplied:
        supplied["name"] = supplied["name"].strip()
    for key, value in supplied.items():
        setattr(tag, key, value)
    try:
        database_session.commit()
        database_session.refresh(tag)
        return _read_tag(database_session, tag)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A tag with this name already exists in this map") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the tag") from error


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    tag = require_tag_role(database_session, tag_id, current_user, "editor")
    database_session.delete(tag)
    database_session.commit()
    return Response(status_code=204)
