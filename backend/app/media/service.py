from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.countries.models import Country
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.photos.storage import (
    InvalidPhotoPathError,
    PhotoFileNotFoundError,
    PhotoStorageError,
    inspect_photo_file,
)
from app.places.models import Place


@dataclass(frozen=True)
class MediaAccess:
    photo: Photo
    place: Place
    poi_map: PoiMap
    country: Country
    uploader: User | None
    role: str

    @property
    def can_edit(self) -> bool:
        return self.role in {"owner", "editor"}


def accessible_media_statement(user_id: UUID) -> Select:
    """Build the common media query without an administrator bypass."""

    return (
        select(Photo, Place, PoiMap, Country, User, MapMembership.role)
        .join(Place, Photo.place_id == Place.id)
        .join(PoiMap, Place.map_id == PoiMap.id)
        .join(Country, PoiMap.country_id == Country.id)
        .outerjoin(User, Photo.uploaded_by_user_id == User.id)
        .outerjoin(
            MapMembership,
            and_(
                MapMembership.map_id == PoiMap.id,
                MapMembership.user_id == user_id,
            ),
        )
        .where(
            Place.deleted_at.is_(None),
            or_(
                PoiMap.owner_id == user_id,
                MapMembership.user_id == user_id,
            ),
        )
    )


def get_media_access(
    database_session: Session,
    media_id: UUID,
    current_user: User,
    *,
    require_editor: bool = False,
) -> MediaAccess:
    row = database_session.execute(
        accessible_media_statement(current_user.id).where(Photo.id == media_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found",
        )
    photo, place, poi_map, country, uploader, membership_role = row
    role = "owner" if poi_map.owner_id == current_user.id else membership_role
    access = MediaAccess(photo, place, poi_map, country, uploader, role)
    if require_editor and not access.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor access is required",
        )
    return access


def infer_file_state(photo: Photo) -> str:
    if photo.path is None or photo.place_id is None:
        return "missing"
    try:
        metadata = inspect_photo_file(photo.path, photo.place_id, photo.id)
    except PhotoFileNotFoundError:
        return "missing"
    except (InvalidPhotoPathError, PhotoStorageError):
        return "error"
    if metadata.width is None or metadata.height is None:
        return "error"
    return "healthy"


def infer_format(photo: Photo) -> str | None:
    if photo.mime_type:
        return photo.mime_type.rsplit("/", 1)[-1].upper()
    suffix = Path(photo.filename).suffix.lstrip(".")
    return suffix.upper() if suffix else None


def apply_media_filters(
    statement: Select,
    *,
    query: str | None,
    map_id: UUID | None,
    country_code: str | None,
    media_format: str | None,
    uploader_id: UUID | None,
    is_primary: bool | None,
    created_from: date | None,
    created_to: date | None,
    min_size: int | None,
    max_size: int | None,
    min_width: int | None,
    min_height: int | None,
    file_state: str | None,
) -> Select:
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(
                Place.name.ilike(pattern),
                PoiMap.name.ilike(pattern),
                Photo.original_name.ilike(pattern),
                Photo.description.ilike(pattern),
            )
        )
    if map_id is not None:
        statement = statement.where(PoiMap.id == map_id)
    if country_code:
        statement = statement.where(Country.iso_alpha2 == country_code.upper())
    if media_format:
        normalized = media_format.lower().removeprefix("image/")
        statement = statement.where(
            func.lower(func.replace(Photo.mime_type, "image/", "")) == normalized
        )
    if uploader_id is not None:
        statement = statement.where(Photo.uploaded_by_user_id == uploader_id)
    if is_primary is not None:
        statement = statement.where(Photo.is_primary.is_(is_primary))
    if created_from is not None:
        statement = statement.where(
            Photo.created_at >= datetime.combine(created_from, time.min)
        )
    if created_to is not None:
        statement = statement.where(
            Photo.created_at
            < datetime.combine(created_to + timedelta(days=1), time.min)
        )
    if min_size is not None:
        statement = statement.where(Photo.file_size_bytes >= min_size)
    if max_size is not None:
        statement = statement.where(Photo.file_size_bytes <= max_size)
    if min_width is not None:
        statement = statement.where(Photo.width >= min_width)
    if min_height is not None:
        statement = statement.where(Photo.height >= min_height)
    if file_state == "missing":
        statement = statement.where(Photo.path.is_(None))
    elif file_state == "error":
        statement = statement.where(
            Photo.path.is_not(None),
            or_(Photo.width.is_(None), Photo.height.is_(None)),
        )
    elif file_state == "healthy":
        statement = statement.where(
            Photo.path.is_not(None),
            Photo.width.is_not(None),
            Photo.height.is_not(None),
        )
    return statement


def sort_expression(sort_by: str, sort_direction: str):
    expressions = {
        "created_at": Photo.created_at,
        "updated_at": Photo.updated_at,
        "size": Photo.file_size_bytes,
        "name": func.lower(func.coalesce(Photo.original_name, Photo.filename)),
        "place": func.lower(Place.name),
        "map": func.lower(PoiMap.name),
    }
    expression = expressions.get(sort_by, Photo.created_at)
    return expression.asc().nullslast() if sort_direction == "asc" else expression.desc().nullslast()
