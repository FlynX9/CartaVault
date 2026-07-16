from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_tag_role
from app.database import get_db
from app.tags.models import Tag
from app.tags.schemas import TagCreate, TagRead, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


def _read(tag: Tag) -> TagRead:
    return TagRead.model_validate(tag, from_attributes=True)


@router.get("", response_model=list[TagRead])
def get_tags(map_id: UUID = Query(), q: str | None = Query(default=None, min_length=1, max_length=100), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[TagRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    statement = select(Tag).where(Tag.map_id == map_id)
    if q is not None:
        statement = statement.where(Tag.name.ilike(f"%{q.strip()}%"))
    return [_read(item) for item in database_session.scalars(statement.order_by(func.lower(Tag.name), Tag.id))]


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TagRead:
    return _read(require_tag_role(database_session, tag_id, current_user, "viewer"))


@router.post("", response_model=TagRead, status_code=201)
def create_tag(data: TagCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> TagRead:
    require_map_role(database_session, data.map_id, current_user, "editor")
    tag = Tag(map_id=data.map_id, name=data.name)
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
        return _read(tag)
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
