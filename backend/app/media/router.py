from datetime import date
from io import BytesIO
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.countries.models import Country
from app.database import get_db
from app.maps.models import PoiMap
from app.auth.permissions import require_map_role, require_place_role
from app.media.schemas import (
    MediaAggregates,
    MediaBulkDelete,
    MediaBulkDeleteResult,
    MediaFilterOptions,
    MediaItemRead,
    MediaMapSummary,
    MediaPlaceAttachment,
    MediaPage,
    MediaPlaceSummary,
    MediaUpdate,
    MediaUploadPolicy,
    MediaUploaderSummary,
)
from app.media.service import (
    apply_media_filters,
    accessible_media_statement,
    get_media_access,
    infer_file_state,
    infer_format,
    sort_expression,
)
from app.media.settings import get_max_upload_megabytes
from app.photos.models import Photo
from app.photos.storage import (
    InvalidPhotoPathError,
    PhotoFileNotFoundError,
    PhotoStorageError,
    delete_photo_file,
    delete_photo_thumbnail,
    get_photo_media_type,
    get_photo_thumbnail,
    normalize_original_name,
    resolve_photo_file,
    store_photo_file,
    UnsupportedPhotoTypeError,
    PhotoTooLargeError,
)
from app.quotas.service import QuotaKey, QuotaService
from app.statuses.models import PlaceStatus
from geoalchemy2.elements import WKTElement
from app.places.history import add_place_history
from app.places.models import Place
from PIL import Image, UnidentifiedImageError


router = APIRouter(prefix="/media", tags=["media"])
# Keep write operations on a non-parameterised prefix.  The application router
# gives a generic ``/media/{media_id}`` route precedence for unsupported HTTP
# methods, which would otherwise turn uploads into 405 responses.
upload_router = APIRouter(prefix="/media-actions", tags=["media"])


@router.get("/upload-policy", response_model=MediaUploadPolicy)
def get_media_upload_policy(
    database_session: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> MediaUploadPolicy:
    maximum = get_max_upload_megabytes(database_session)
    return MediaUploadPolicy(
        max_upload_megabytes=maximum,
        max_upload_bytes=maximum * 1024 * 1024,
    )


def media_name(photo: Photo) -> str:
    """Turn a filename into a useful, editable initial POI name."""
    raw = (photo.original_name or photo.filename).rsplit(".", 1)[0]
    return raw.replace("_", " ").replace("-", " ").strip()[:255] or "Photo géolocalisée"


def read_uploaded_gps(source: UploadFile) -> tuple[float, float] | None:
    """Read GPS from an uncompressed client source without retaining that file."""
    try:
        content = source.file.read()
        with Image.open(BytesIO(content)) as image:
            gps = image.getexif().get_ifd(34853)
        if not gps:
            return None
        latitude_values, longitude_values = gps.get(2), gps.get(4)
        latitude_ref, longitude_ref = gps.get(1), gps.get(3)
        if not latitude_values or not longitude_values:
            return None

        def to_decimal(values) -> float:
            degrees, minutes, seconds = (float(value) for value in values)
            return degrees + minutes / 60 + seconds / 3600

        latitude, longitude = to_decimal(latitude_values), to_decimal(longitude_values)
        if isinstance(latitude_ref, bytes):
            latitude_ref = latitude_ref.decode(errors="ignore")
        if isinstance(longitude_ref, bytes):
            longitude_ref = longitude_ref.decode(errors="ignore")
        if str(latitude_ref).upper() == "S":
            latitude = -latitude
        if str(longitude_ref).upper() == "W":
            longitude = -longitude
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            return None
        return latitude, longitude
    except (OSError, UnidentifiedImageError, ValueError, TypeError, ZeroDivisionError):
        return None


def to_media_read(row, current_user_id: UUID) -> MediaItemRead:
    photo, place, poi_map, country, uploader, membership_role = row
    role = "owner" if poi_map.owner_id == current_user_id else membership_role
    return MediaItemRead(
        id=photo.id,
        original_name=photo.original_name,
        caption=photo.description,
        taken_at=photo.taken_at,
        created_at=photo.created_at,
        updated_at=photo.updated_at,
        is_primary=photo.is_primary,
        mime_type=photo.mime_type,
        format=infer_format(photo),
        file_size_bytes=photo.file_size_bytes,
        width=photo.width,
        height=photo.height,
        file_state=infer_file_state(photo),
        can_edit=role in {"owner", "editor"},
        place=(MediaPlaceSummary(id=place.id, name=place.name, region=place.region) if place is not None else None),
        map=MediaMapSummary(
            id=poi_map.id,
            name=poi_map.name,
            country_code=country.iso_alpha2,
            country_name=country.name,
        ),
        uploader=(
            MediaUploaderSummary(id=uploader.id, name=uploader.display_name)
            if uploader is not None
            else None
        ),
        latitude=photo.latitude,
        longitude=photo.longitude,
        # An unattached image can always start POI creation for an editor. GPS
        # coordinates are used as a prefill when available; otherwise the UI
        # opens the map's default location for manual placement.
        can_create_place=place is None and role in {"owner", "editor"},
    )


@router.get("", response_model=MediaPage)
def list_media(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    map_id: UUID | None = None,
    country_code: str | None = Query(default=None, min_length=2, max_length=2),
    format: str | None = Query(default=None, max_length=20),
    uploader_id: UUID | None = None,
    is_primary: bool | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    min_size: int | None = Query(default=None, ge=0),
    max_size: int | None = Query(default=None, ge=0),
    min_width: int | None = Query(default=None, ge=1),
    min_height: int | None = Query(default=None, ge=1),
    file_state: str | None = Query(
        default=None,
        pattern="^(healthy|missing|error)$",
    ),
    sort_by: str = Query(
        default="created_at",
        pattern="^(created_at|updated_at|size|name|place|map)$",
    ),
    sort_direction: str = Query(default="desc", pattern="^(asc|desc)$"),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaPage:
    """Return a permission-scoped, paginated media catalogue."""

    if (
        min_size is not None
        and max_size is not None
        and min_size > max_size
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="min_size must not exceed max_size",
        )

    base = accessible_media_statement(current_user.id)
    filtered = apply_media_filters(
        base,
        query=q,
        map_id=map_id,
        country_code=country_code,
        media_format=format,
        uploader_id=uploader_id,
        is_primary=is_primary,
        created_from=created_from,
        created_to=created_to,
        min_size=min_size,
        max_size=max_size,
        min_width=min_width,
        min_height=min_height,
        file_state=file_state,
    )
    total = database_session.scalar(
        select(func.count()).select_from(filtered.order_by(None).subquery())
    ) or 0
    rows = database_session.execute(
        filtered.order_by(
            sort_expression(sort_by, sort_direction),
            Photo.id,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    aggregate_source = filtered.with_only_columns(
        Photo.file_size_bytes.label("file_size_bytes"),
        Photo.is_primary.label("is_primary"),
        Photo.path.label("path"),
        Photo.width.label("width"),
        Photo.height.label("height"),
    ).order_by(None).subquery()
    aggregate = database_session.execute(
        select(
            func.coalesce(func.sum(aggregate_source.c.file_size_bytes), 0),
            func.count().filter(aggregate_source.c.is_primary.is_(True)),
            func.count().filter(aggregate_source.c.path.is_(None)),
            func.count().filter(
                aggregate_source.c.path.is_not(None),
                (aggregate_source.c.width.is_(None))
                | (aggregate_source.c.height.is_(None)),
            ),
        )
    ).one()

    map_options = database_session.execute(
        base.with_only_columns(
            PoiMap.id,
            PoiMap.name,
            Country.iso_alpha2,
            Country.name,
        )
        .distinct()
        .order_by(PoiMap.name, PoiMap.id)
    ).all()
    uploader_options = database_session.execute(
        base.with_only_columns(User.id, User.display_name)
        .where(User.id.is_not(None))
        .distinct()
        .order_by(User.display_name, User.id)
    ).all()
    format_options = database_session.scalars(
        base.with_only_columns(Photo.mime_type)
        .where(Photo.mime_type.is_not(None))
        .distinct()
        .order_by(Photo.mime_type)
    ).all()

    return MediaPage(
        items=[to_media_read(row, current_user.id) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
        pages=max(1, ceil(total / page_size)),
        aggregates=MediaAggregates(
            total_count=total,
            total_size_bytes=int(aggregate[0]),
            primary_count=aggregate[1],
            missing_count=aggregate[2],
            error_count=aggregate[3],
        ),
        filters=MediaFilterOptions(
            maps=[
                MediaMapSummary(
                    id=row.id,
                    name=row.name,
                    country_code=row.iso_alpha2,
                    country_name=row[3],
                )
                for row in map_options
            ],
            formats=[
                value.rsplit("/", 1)[-1].upper()
                for value in format_options
                if value
            ],
            uploaders=[
                MediaUploaderSummary(id=row.id, name=row.display_name)
                for row in uploader_options
            ],
        ),
    )


@upload_router.post("/upload", response_model=MediaItemRead, status_code=status.HTTP_201_CREATED)
def upload_unassigned_media(
    map_id: UUID = Form(...),
    file: UploadFile = File(...),
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    gps_source: UploadFile | None = File(default=None),
    taken_at: date | None = Form(default=None),
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    """Store one compressed browser upload until the user chooses its POI."""
    if latitude is None and longitude is None and gps_source is not None:
        coordinates = read_uploaded_gps(gps_source)
        if coordinates is not None:
            latitude, longitude = coordinates
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=422, detail="Latitude and longitude must be provided together")
    access = require_map_role(database_session, map_id, current_user, "editor")
    quotas = QuotaService(database_session)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.PHOTOS_TOTAL_MAX)
    from uuid import uuid4
    photo_id = uuid4()
    try:
        stored = store_photo_file(file.file, file.content_type, map_id, photo_id, max_size_bytes=get_max_upload_megabytes(database_session) * 1024 * 1024)
        quotas.ensure_can_create(access.map.owner_id, QuotaKey.STORAGE_BYTES_MAX, increment=stored.file_size_bytes)
        photo = Photo(
            id=photo_id, map_id=map_id, storage_scope_id=map_id,
            filename=stored.filename, original_name=normalize_original_name(file.filename), path=stored.relative_path,
            mime_type=stored.media_type, file_size_bytes=stored.file_size_bytes, width=stored.width, height=stored.height,
            uploaded_by_user_id=current_user.id, latitude=latitude, longitude=longitude, taken_at=taken_at,
            sort_order=0, is_primary=False,
        )
        database_session.add(photo); database_session.commit()
    except (UnsupportedPhotoTypeError, PhotoTooLargeError) as error:
        database_session.rollback(); raise HTTPException(status_code=415, detail=str(error)) from error
    except Exception as error:
        database_session.rollback(); raise HTTPException(status_code=500, detail="Unable to store media") from error
    row = database_session.execute(accessible_media_statement(current_user.id).where(Photo.id == photo_id)).one()
    return to_media_read(row, current_user.id)


@upload_router.post("/{media_id}/create-place", response_model=MediaItemRead)
def create_place_from_media(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    """Create the POI at EXIF coordinates and attach the previously orphaned image."""
    access = get_media_access(database_session, media_id, current_user, require_editor=True)
    photo = access.photo
    if photo.place_id is not None:
        raise HTTPException(status_code=409, detail="Media is already attached to a place")
    if photo.latitude is None or photo.longitude is None:
        raise HTTPException(status_code=422, detail="Media has no GPS coordinates")
    default_status = database_session.scalar(select(PlaceStatus).where(PlaceStatus.map_id == photo.map_id, PlaceStatus.is_default.is_(True)))
    if default_status is None:
        raise HTTPException(status_code=409, detail="No default place status is configured")
    QuotaService(database_session).ensure_can_create(current_user.id, QuotaKey.PLACES_PER_MAP_MAX, scope_id=photo.map_id)
    place = Place(name=media_name(photo), map_id=photo.map_id, status_id=default_status.id, location=WKTElement(f"POINT({photo.longitude} {photo.latitude})", srid=4326))
    try:
        database_session.add(place); database_session.flush()
        photo.place_id = place.id; photo.is_primary = True; photo.sort_order = 0
        add_place_history(database_session, place.id, current_user.id, "created", {"name": {"old": None, "new": place.name}, "source": "media"})
        add_place_history(database_session, place.id, current_user.id, "photo_added", {"photo": {"old": None, "new": {"id": str(photo.id), "original_name": photo.original_name}}})
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback(); raise HTTPException(status_code=500, detail="Unable to create place from media") from error
    row = database_session.execute(accessible_media_statement(current_user.id).where(Photo.id == media_id)).one()
    return to_media_read(row, current_user.id)


@upload_router.post("/{media_id}/attach-place", response_model=MediaItemRead)
def attach_media_to_place(
    media_id: UUID,
    data: MediaPlaceAttachment,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    """Attach a previously uploaded geotagged image after its POI is saved."""
    access = get_media_access(database_session, media_id, current_user, require_editor=True)
    photo = access.photo
    if photo.place_id is not None:
        raise HTTPException(status_code=409, detail="Media is already attached to a place")
    place = require_place_role(database_session, data.place_id, current_user, "editor")
    if place.map_id != photo.map_id:
        raise HTTPException(status_code=422, detail="The place and media must belong to the same map")
    try:
        photo.place_id = place.id
        has_primary_photo = database_session.scalar(
            select(Photo.id).where(Photo.place_id == place.id, Photo.is_primary.is_(True))
        )
        if has_primary_photo is None:
            photo.is_primary = True
            photo.sort_order = 0
        add_place_history(
            database_session,
            place.id,
            current_user.id,
            "photo_added",
            {"photo": {"old": None, "new": {"id": str(photo.id), "original_name": photo.original_name}}},
        )
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to attach media to place") from error
    row = database_session.execute(accessible_media_statement(current_user.id).where(Photo.id == media_id)).one()
    return to_media_read(row, current_user.id)


@router.get("/{media_id}", response_model=MediaItemRead)
def get_media(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    row = database_session.execute(
        accessible_media_statement(current_user.id).where(Photo.id == media_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Media not found")
    return to_media_read(row, current_user.id)


@router.get("/{media_id}/thumbnail", response_class=FileResponse)
def get_media_thumbnail(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    access = get_media_access(database_session, media_id, current_user)
    if access.photo.path is None:
        raise HTTPException(status_code=404, detail="Media file not found")
    try:
        thumbnail = get_photo_thumbnail(
            access.photo.path,
            access.photo.storage_scope_id,
            access.photo.id,
        )
    except PhotoFileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Media file not found") from error
    except (InvalidPhotoPathError, PhotoStorageError) as error:
        raise HTTPException(
            status_code=422,
            detail="Media thumbnail is unavailable",
        ) from error
    return FileResponse(thumbnail, media_type="image/webp")


@router.get("/{media_id}/download", response_class=FileResponse)
def download_media(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    access = get_media_access(database_session, media_id, current_user)
    photo = access.photo
    if photo.path is None:
        raise HTTPException(status_code=404, detail="Media file not found")
    try:
        path = resolve_photo_file(
            photo.path,
            photo.storage_scope_id,
            photo.id,
            require_file=True,
        )
    except PhotoFileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Media file not found") from error
    except InvalidPhotoPathError as error:
        raise HTTPException(status_code=422, detail="Invalid media path") from error
    return FileResponse(
        path,
        media_type=get_photo_media_type(path),
        filename=normalize_original_name(photo.original_name) or photo.filename,
        content_disposition_type="attachment",
    )


@router.patch("/{media_id}", response_model=MediaItemRead)
def update_media(
    media_id: UUID,
    payload: MediaUpdate,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    access = get_media_access(
        database_session,
        media_id,
        current_user,
        require_editor=True,
    )
    supplied = payload.model_dump(exclude_unset=True)
    if "caption" in supplied:
        access.photo.description = supplied["caption"]
    if "taken_at" in supplied:
        access.photo.taken_at = supplied["taken_at"]
    try:
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update media") from error
    row = database_session.execute(
        accessible_media_statement(current_user.id).where(Photo.id == media_id)
    ).one()
    return to_media_read(row, current_user.id)


@router.post("/{media_id}/set-main", response_model=MediaItemRead)
def set_main_media(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemRead:
    access = get_media_access(
        database_session,
        media_id,
        current_user,
        require_editor=True,
    )
    if access.photo.place_id is None:
        raise HTTPException(status_code=409, detail="Unattached media cannot be a primary place photo")
    database_session.execute(
        update(Photo)
        .where(
            Photo.place_id == access.photo.place_id,
            Photo.id != media_id,
        )
        .values(is_primary=False)
    )
    access.photo.is_primary = True
    try:
        if access.place is not None:
            add_place_history(database_session, access.place.id, current_user.id, "photo_primary_changed", {"photo_id": str(media_id)})
        database_session.commit()
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to set main media") from error
    row = database_session.execute(
        accessible_media_statement(current_user.id).where(Photo.id == media_id)
    ).one()
    return to_media_read(row, current_user.id)


def delete_accesses(
    accesses,
    database_session: Session,
    current_user: User,
) -> int:
    stored_files: list[tuple[str, UUID, UUID]] = []
    affected_places: set[UUID] = set()
    try:
        for access in accesses:
            photo = access.photo
            if access.place is not None:
                affected_places.add(access.place.id)
            if photo.path is not None:
                resolve_photo_file(
                    photo.path,
                    photo.storage_scope_id,
                    photo.id,
                    require_file=False,
                )
                stored_files.append((photo.path, photo.storage_scope_id, photo.id))
            database_session.delete(photo)
            if access.place is not None:
                add_place_history(database_session, access.place.id, current_user.id, "photo_removed", {"photo": {"old": {"id": str(photo.id)}, "new": None}})
        database_session.flush()
        for place_id in affected_places:
            remaining = database_session.scalars(
                select(Photo)
                .where(Photo.place_id == place_id)
                .order_by(Photo.sort_order, Photo.id)
            ).all()
            for position, photo in enumerate(remaining):
                photo.sort_order = position
                photo.is_primary = position == 0
        database_session.commit()
    except (SQLAlchemyError, InvalidPhotoPathError) as error:
        database_session.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to delete media",
        ) from error

    for path, place_id, photo_id in stored_files:
        try:
            delete_photo_file(path, place_id, photo_id)
        except PhotoStorageError:
            # Database deletion remains authoritative. A storage cleanup job can
            # safely remove any residual file without exposing its path.
            pass
        try:
            delete_photo_thumbnail(photo_id)
        except PhotoStorageError:
            pass
    return len(accesses)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    media_id: UUID,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    access = get_media_access(
        database_session,
        media_id,
        current_user,
        require_editor=True,
    )
    try:
        delete_accesses([access], database_session, current_user)
    except (SQLAlchemyError, PhotoStorageError) as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to delete media") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/bulk-delete", response_model=MediaBulkDeleteResult)
def bulk_delete_media(
    payload: MediaBulkDelete,
    database_session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaBulkDeleteResult:
    ids = list(dict.fromkeys(payload.media_ids))
    accesses = [
        get_media_access(
            database_session,
            media_id,
            current_user,
            require_editor=True,
        )
        for media_id in ids
    ]
    try:
        deleted = delete_accesses(accesses, database_session, current_user)
    except (SQLAlchemyError, PhotoStorageError) as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to delete media") from error
    return MediaBulkDeleteResult(
        selected_count=len(ids),
        deleted_count=deleted,
    )
