from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.categories.schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
)
from app.database import get_db


router = APIRouter(
    prefix="/categories",
    tags=["categories"],
)


def build_category_read_statement():
    """Build the common query used to expose categories through the API."""

    return select(
        Category.id,
        Category.name,
        Category.description,
        Category.icon,
    )


@router.get(
    "",
    response_model=list[CategoryRead],
)
def get_categories(
    q: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Case-insensitive search in category names",
    ),
    database_session: Session = Depends(get_db),
) -> list[CategoryRead]:
    """Return categories using an optional name search."""

    statement = build_category_read_statement()

    if q is not None:
        search_pattern = f"%{q.strip()}%"

        statement = statement.where(
            Category.name.ilike(search_pattern)
        )

    statement = statement.order_by(
        func.lower(Category.name),
        Category.id,
    )

    rows = database_session.execute(statement).mappings().all()

    return [CategoryRead(**row) for row in rows]


@router.get(
    "/{category_id}",
    response_model=CategoryRead,
)
def get_category(
    category_id: UUID,
    database_session: Session = Depends(get_db),
) -> CategoryRead:
    """Return one category by its UUID."""

    statement = build_category_read_statement().where(
        Category.id == category_id
    )

    row = database_session.execute(statement).mappings().one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    return CategoryRead(**row)


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    category_data: CategoryCreate,
    database_session: Session = Depends(get_db),
) -> CategoryRead:
    """Create a category."""

    category = Category(
        name=category_data.name.strip(),
        description=category_data.description,
        icon=category_data.icon,
    )

    try:
        database_session.add(category)
        database_session.commit()
        database_session.refresh(category)

        return CategoryRead(
            id=category.id,
            name=category.name,
            description=category.description,
            icon=category.icon,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the category",
        ) from error


@router.patch(
    "/{category_id}",
    response_model=CategoryRead,
)
def update_category(
    category_id: UUID,
    category_data: CategoryUpdate,
    database_session: Session = Depends(get_db),
) -> CategoryRead:
    """Partially update a category."""

    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    supplied_data = category_data.model_dump(exclude_unset=True)

    if "name" in supplied_data:
        supplied_data["name"] = supplied_data["name"].strip()

    for field_name, field_value in supplied_data.items():
        setattr(category, field_name, field_value)

    try:
        database_session.commit()
        database_session.refresh(category)

        return CategoryRead(
            id=category.id,
            name=category.name,
            description=category.description,
            icon=category.icon,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the category",
        ) from error


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Delete a category."""

    category = database_session.get(Category, category_id)

    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Category with id {category_id} was not found",
        )

    try:
        database_session.delete(category)
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the category",
        ) from error
