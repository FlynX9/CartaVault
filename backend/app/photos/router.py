from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.photos.models import Photo
from app.photos.schemas import PhotoCreate, PhotoRead, PhotoUpdate
from app.places.models import Place


router = APIRouter(
    tags=["photos"],
)


def build_photo_read_statement():
    """Build the common query used to expose photo metadata."""

    return select(
        Photo.id,
        Photo.place_id,
        Photo.filename,
        Photo.original_name,
        Photo.path,
        Photo.description,
        Photo.taken_at,
        Photo.created_at,
    )


@router.get(
    "/places/{place_id}/photos",
    response_model=list[PhotoRead],
)
def get_place_photos(
    place_id: UUID,
    database_session: Session = Depends(get_db),
) -> list[PhotoRead]:
    """Return photo metadata associated with one place."""

    if database_session.get(Place, place_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    statement = (
        build_photo_read_statement()
        .where(Photo.place_id == place_id)
        .order_by(
            Photo.created_at,
            Photo.id,
        )
    )

    rows = database_session.execute(statement).mappings().all()

    return [PhotoRead(**row) for row in rows]


@router.post(
    "/places/{place_id}/photos",
    response_model=PhotoRead,
    status_code=status.HTTP_201_CREATED,
)
def create_place_photo(
    place_id: UUID,
    photo_data: PhotoCreate,
    database_session: Session = Depends(get_db),
) -> PhotoRead:
    """Create photo metadata associated with one place."""

    if database_session.get(Place, place_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    photo = Photo(
        place_id=place_id,
        filename=photo_data.filename,
        original_name=photo_data.original_name,
        description=photo_data.description,
        taken_at=photo_data.taken_at,
    )

    try:
        database_session.add(photo)
        database_session.commit()
        database_session.refresh(photo)

        return PhotoRead(
            id=photo.id,
            place_id=photo.place_id,
            filename=photo.filename,
            original_name=photo.original_name,
            path=photo.path,
            description=photo.description,
            taken_at=photo.taken_at,
            created_at=photo.created_at,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the photo metadata",
        ) from error


@router.get(
    "/photos/{photo_id}",
    response_model=PhotoRead,
)
def get_photo(
    photo_id: UUID,
    database_session: Session = Depends(get_db),
) -> PhotoRead:
    """Return photo metadata by UUID."""

    statement = build_photo_read_statement().where(
        Photo.id == photo_id
    )

    row = database_session.execute(statement).mappings().one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with id {photo_id} was not found",
        )

    return PhotoRead(**row)


@router.patch(
    "/photos/{photo_id}",
    response_model=PhotoRead,
)
def update_photo(
    photo_id: UUID,
    photo_data: PhotoUpdate,
    database_session: Session = Depends(get_db),
) -> PhotoRead:
    """Partially update photo metadata."""

    photo = database_session.get(Photo, photo_id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with id {photo_id} was not found",
        )

    supplied_data = photo_data.model_dump(exclude_unset=True)

    for field_name, field_value in supplied_data.items():
        setattr(photo, field_name, field_value)

    try:
        database_session.commit()
        database_session.refresh(photo)

        return PhotoRead(
            id=photo.id,
            place_id=photo.place_id,
            filename=photo.filename,
            original_name=photo.original_name,
            path=photo.path,
            description=photo.description,
            taken_at=photo.taken_at,
            created_at=photo.created_at,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update the photo metadata",
        ) from error


@router.delete(
    "/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_photo(
    photo_id: UUID,
    database_session: Session = Depends(get_db),
) -> Response:
    """Delete only the photo metadata row."""

    photo = database_session.get(Photo, photo_id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with id {photo_id} was not found",
        )

    try:
        database_session.delete(photo)
        database_session.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT,
        )

    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the photo metadata",
        ) from error
