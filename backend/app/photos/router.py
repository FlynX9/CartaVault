from datetime import date
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.photos.models import Photo
from app.photos.schemas import PhotoCreate, PhotoRead, PhotoUpdate
from app.photos.storage import (
    InvalidPhotoPathError,
    PhotoFileNotFoundError,
    PhotoStorageError,
    PhotoTooLargeError,
    UnsupportedPhotoTypeError,
    delete_photo_file,
    get_photo_media_type,
    normalize_original_name,
    resolve_photo_file,
    store_photo_file,
)
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


@router.post(
    "/places/{place_id}/photos/upload",
    response_model=PhotoRead,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "The requested place was not found",
        },
        status.HTTP_413_CONTENT_TOO_LARGE: {
            "description": "The uploaded image exceeds 20 MiB",
        },
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: {
            "description": "The multipart or binary image type is unsupported",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "description": "The image could not be stored",
        },
    },
)
def upload_place_photo(
    place_id: UUID,
    file: UploadFile = File(
        description="JPEG, PNG or WebP image, up to 20 MiB",
    ),
    description: str | None = Form(default=None),
    taken_at: date | None = Form(default=None),
    database_session: Session = Depends(get_db),
) -> PhotoRead:
    """Store an image and create its associated database metadata."""

    if database_session.get(Place, place_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Place with id {place_id} was not found",
        )

    photo_id = uuid4()

    try:
        stored_photo = store_photo_file(
            source=file.file,
            content_type=file.content_type,
            place_id=place_id,
            photo_id=photo_id,
        )
    except UnsupportedPhotoTypeError as error:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(error),
        ) from error
    except PhotoTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(error),
        ) from error
    except PhotoStorageError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to store the uploaded image",
        ) from error

    photo = Photo(
        id=photo_id,
        place_id=place_id,
        filename=stored_photo.filename,
        original_name=normalize_original_name(file.filename),
        path=stored_photo.relative_path,
        description=description,
        taken_at=taken_at,
    )

    try:
        database_session.add(photo)
        database_session.flush()
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()

        try:
            delete_photo_file(
                stored_photo.relative_path,
                place_id,
                photo_id,
            )
        except PhotoStorageError as cleanup_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Unable to create the photo metadata or clean up "
                    "the stored image"
                ),
            ) from cleanup_error

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the photo metadata",
        ) from error

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


@router.get(
    "/photos/{photo_id}/file",
    response_class=FileResponse,
    responses={
        status.HTTP_404_NOT_FOUND: {
            "description": "The photo metadata or physical file was not found",
        },
        status.HTTP_500_INTERNAL_SERVER_ERROR: {
            "description": "The stored photo path is invalid",
        },
    },
)
def get_photo_file(
    photo_id: UUID,
    database_session: Session = Depends(get_db),
) -> FileResponse:
    """Serve one safely resolved physical photo file."""

    photo = database_session.get(Photo, photo_id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with id {photo_id} was not found",
        )

    if photo.path is None or photo.place_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The physical photo file was not found",
        )

    try:
        file_path = resolve_photo_file(
            photo.path,
            photo.place_id,
            photo.id,
            require_file=True,
        )
        media_type = get_photo_media_type(file_path)
    except PhotoFileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The physical photo file was not found",
        ) from error
    except InvalidPhotoPathError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The stored photo path is invalid",
        ) from error

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=(
            normalize_original_name(photo.original_name)
            or photo.filename
        ),
        content_disposition_type="inline",
    )


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

    if photo.path is not None:
        if photo.place_id is None:
            database_session.rollback()

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The stored photo path is invalid",
            )

        try:
            resolve_photo_file(
                photo.path,
                photo.place_id,
                photo.id,
                require_file=False,
            )
        except InvalidPhotoPathError as error:
            database_session.rollback()

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The stored photo path is invalid",
            ) from error

    stored_path = photo.path
    stored_place_id = photo.place_id

    try:
        database_session.delete(photo)
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the photo metadata",
        ) from error

    if stored_path is not None and stored_place_id is not None:
        try:
            delete_photo_file(
                stored_path,
                stored_place_id,
                photo_id,
            )
        except PhotoStorageError as error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "The photo metadata was deleted, but the physical "
                    "file cleanup failed"
                ),
            ) from error

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
    )
