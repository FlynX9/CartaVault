from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_category_role, require_map_role
from app.categories.models import Category
from app.categories.schemas import CategoryCreate, CategoryRead, CategoryUpdate
from app.database import get_db

router = APIRouter(prefix="/categories", tags=["categories"])


def _read(category: Category) -> CategoryRead:
    return CategoryRead.model_validate(category, from_attributes=True)


@router.get("", response_model=list[CategoryRead])
def get_categories(map_id: UUID = Query(), q: str | None = Query(default=None, min_length=1, max_length=100), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[CategoryRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    statement = select(Category).where(Category.map_id == map_id)
    if q is not None:
        statement = statement.where(Category.name.ilike(f"%{q.strip()}%"))
    return [_read(item) for item in database_session.scalars(statement.order_by(func.lower(Category.name), Category.id))]


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRead:
    return _read(require_category_role(database_session, category_id, current_user, "viewer"))


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(data: CategoryCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRead:
    require_map_role(database_session, data.map_id, current_user, "editor")
    category = Category(map_id=data.map_id, name=data.name.strip(), description=data.description, icon=data.icon)
    try:
        database_session.add(category)
        database_session.commit()
        database_session.refresh(category)
        return _read(category)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A category with this name already exists in this map") from error


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(category_id: UUID, data: CategoryUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRead:
    category = require_category_role(database_session, category_id, current_user, "editor")
    supplied = data.model_dump(exclude_unset=True)
    if "name" in supplied:
        supplied["name"] = supplied["name"].strip()
    for key, value in supplied.items():
        setattr(category, key, value)
    try:
        database_session.commit()
        database_session.refresh(category)
        return _read(category)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A category with this name already exists in this map") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the category") from error


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    category = require_category_role(database_session, category_id, current_user, "editor")
    database_session.delete(category)
    database_session.commit()
    return Response(status_code=204)
