from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.tags.models import Tag
from app.tags.schemas import TagCreate, TagRead, TagUpdate


router = APIRouter(
    prefix="/tags",
    tags=["tags"],
)


def build_tag_read_statement():
    """Build the common query used to expose tags through the API."""

    return select(
        Tag.id,
        Tag.name,
    )


@router.get(
    "",
    response_model=list[TagRead],
)
def get_tags(
    q: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
        description="Case-insensitive search in tag names",
    ),
    database_session: Session = Depends(get_db),
) -> list[TagRead]:
    """Return tags using an optional name search."""

    statement = build_tag_read_statement()

    if q is not None:
        search_pattern = f"%{q.strip()}%"

        statement = statement.where(
            Tag.name.ilike(search_pattern)
        )

    statement = statement.order_by(
        func.lower(Tag.name),
        Tag.id,
    )

    rows = database_session.execute(statement).mappings().all()

    return [TagRead(**row) for row in rows]


@router.get(
    "/{tag_id}",
    response_model=TagRead,
)
def get_tag(
    tag_id: UUID,
    database_session: Session = Depends(get_db),
) -> TagRead:
    """Return one tag by its UUID."""

    statement = build_tag_read_statement().where(
        Tag.id == tag_id
    )

    row = database_session.execute(statement).mappings().one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    return TagRead(**row)


@router.post(
    "",
    response_model=TagRead,
    status_code=status.HTTP_201_CREATED,
)
def create_tag(
    tag_data: TagCreate,
    database_session: Session = Depends(get_db),
) -> TagRead:
    """Create a tag."""

    tag = Tag(
        name=tag_data.name.strip(),
    )

    try:
        database_session.add(tag)
        database_session.commit()
        database_session.refresh(tag)

        return TagRead(
            id=tag.id,
            name=tag.name,
        )

    except IntegrityError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists",
        ) from error

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the tag",
        ) from error


@router.patch(
    "/{tag_id}",
    response_model=TagRead,
)
def update_tag(
    tag_id: UUID,
    tag_data: TagUpdate,
    database_session: Session = Depends(get_db),
) -> TagRead:
    """Partially update a tag."""

    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    supplied_data = tag_data.model_dump(exclude_unset=True)

    if "name" in supplied_data:
        supplied_data["name"] = supplied_data["name"].strip()

    for field_name, field_value in supplied_data.items():
        setattr(tag, field_name, field_value)

    try:
        database_session.commit()
        database_session.refresh(tag)

        return TagRead(
            id=tag.id,
            name=tag.name,
        )

    except IntegrityError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tag with this name already exists",
        ) from error

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the tag",
        ) from error


@router.delete(
    "/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_tag(
    tag_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Delete a tag."""

    tag = database_session.get(Tag, tag_id)

    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tag with id {tag_id} was not found",
        )

    try:
        database_session.delete(tag)
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the tag",
        ) from error
