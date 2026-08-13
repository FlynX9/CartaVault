from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_category_role, require_map_role
from app.categories.models import IMPORTED_CATEGORY_NAME, Category
from app.categories.schemas import CategoryCreate, CategoryOrder, CategoryRead, CategoryUpdate
from app.database import get_db
from app.places.models import Place
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService

router = APIRouter(prefix="/categories", tags=["categories"])


def _read(category: Category, places_count: int = 0) -> CategoryRead:
    return CategoryRead.model_validate(category, from_attributes=True).model_copy(update={"places_count": places_count})


def _read_statement():
    return (
        select(
            Category,
            func.count(Place.id).filter(Place.deleted_at.is_(None)).label("places_count"),
        )
        .outerjoin(Category.places)
        .group_by(Category.id)
    )


def _read_category(database_session: Session, category: Category) -> CategoryRead:
    row = database_session.execute(_read_statement().where(Category.id == category.id)).one()
    return _read(*row)


@router.get("", response_model=list[CategoryRead])
def get_categories(map_id: UUID = Query(), q: str | None = Query(default=None, min_length=1, max_length=100), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[CategoryRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    statement = _read_statement().where(Category.map_id == map_id)
    if q is not None:
        statement = statement.where(Category.name.ilike(f"%{q.strip()}%"))
    return [_read(*row) for row in database_session.execute(statement.order_by(Category.sort_order, func.lower(Category.name), Category.id)).all()]


@router.post("/reorder", response_model=list[CategoryRead])
def reorder_categories(data: CategoryOrder, map_id: UUID = Query(...), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[CategoryRead]:
    require_map_role(database_session, map_id, current_user, "editor")
    categories = list(database_session.scalars(select(Category).where(Category.map_id == map_id).order_by(Category.sort_order, func.lower(Category.name), Category.id)))
    if len(data.ids) != len(categories) or set(data.ids) != {item.id for item in categories}:
        raise HTTPException(status_code=422, detail="The category order must contain every category exactly once")
    try:
        for item in categories:
            item.sort_order += 10_000
        database_session.flush()
        by_id = {item.id: item for item in categories}
        for index, category_id in enumerate(data.ids, start=1):
            by_id[category_id].sort_order = index * 10
        database_session.commit()
        return [_read_category(database_session, by_id[category_id]) for category_id in data.ids]
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to reorder categories") from error


@router.get("/{category_id}", response_model=CategoryRead)
def get_category(category_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRead:
    return _read_category(database_session, require_category_role(database_session, category_id, current_user, "viewer"))


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(data: CategoryCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> CategoryRead:
    require_map_role(database_session, data.map_id, current_user, "editor")
    QuotaService(database_session).ensure_can_create(current_user.id, QuotaKey.CATEGORIES_PER_MAP_MAX, scope_id=data.map_id)
    category = Category(map_id=data.map_id, name=data.name.strip(), description=data.description, icon=data.icon, marks_as_visited=data.marks_as_visited, sort_order=(database_session.scalar(select(func.coalesce(func.max(Category.sort_order), 0)).where(Category.map_id == data.map_id)) + 10))
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
        return _read_category(database_session, category)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A category with this name already exists in this map") from error
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the category") from error


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    category = require_category_role(database_session, category_id, current_user, "editor")
    if category.name.strip().casefold() == IMPORTED_CATEGORY_NAME.casefold():
        raise HTTPException(status_code=409, detail="The imported category is protected and cannot be deleted")
    database_session.delete(category)
    database_session.commit()
    return Response(status_code=204)
