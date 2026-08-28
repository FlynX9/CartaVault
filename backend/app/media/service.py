from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.countries.models import Country
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place


@dataclass(frozen=True)
class MediaAccess:
    photo: Photo
    place: Place | None
    poi_map: PoiMap | None
    country: Country | None
    uploader: User | None
    role: str

    @property
    def can_edit(self) -> bool:
        return self.role in {"owner", "editor"}


def declared_file_state(path=None, scope_id=None, width=None, height=None):
    """SQL expression computing one photo's declared state.

    Single source of truth for the catalogue's file_state semantics; the
    Python mirror lives in ``infer_file_state`` and must stay aligned.
    Defaults to the ``Photo`` columns so it can be reused on any compatible
    selectable (listing filters, aggregate counts).
    """

    path = path if path is not None else Photo.path
    scope_id = scope_id if scope_id is not None else Photo.storage_scope_id
    width = width if width is not None else Photo.width
    height = height if height is not None else Photo.height
    return case(
        (
            or_(path.is_(None), scope_id.is_(None)),
            "missing",
        ),
        (
            or_(width.is_(None), height.is_(None)),
            "error",
        ),
        else_="healthy",
    )


def media_presentation_statement(user_id: UUID) -> Select:
    """Build the presentation joins shared by media reads and listing pages."""

    return (
        select(Photo, Place, PoiMap, Country, User, MapMembership.role)
        .outerjoin(Place, Photo.place_id == Place.id)
        .outerjoin(PoiMap, PoiMap.id == func.coalesce(Place.map_id, Photo.map_id))
        .outerjoin(Country, PoiMap.country_id == Country.id)
        .outerjoin(User, Photo.uploaded_by_user_id == User.id)
        .outerjoin(
            MapMembership,
            and_(
                MapMembership.map_id == PoiMap.id,
                MapMembership.user_id == user_id,
            ),
        )
    )


def accessible_media_statement(user_id: UUID) -> Select:
    """Build the canonical media query without an administrator bypass.

    An attached photo is governed exclusively by its place's map:
    ``Photo.map_id`` is a denormalised cache and must never widen access,
    even when it still references the map the photo historically lived on.
    Only a photo attached to no place falls back to ``Photo.map_id``, and
    only a fully orphaned upload stays visible to its uploader alone.
    """

    return (
        media_presentation_statement(user_id)
        .where(
            or_(Place.id.is_(None), Place.deleted_at.is_(None)),
            # A trashed map must not become reachable again through /media.
            # For a fully orphaned photo the joined row is NULL and IS NULL
            # evaluates true, keeping uploader-only visibility intact.
            PoiMap.deleted_at.is_(None),
            or_(
                and_(
                    Photo.place_id.is_(None),
                    Photo.map_id.is_(None),
                    Photo.uploaded_by_user_id == user_id,
                ),
                PoiMap.owner_id == user_id,
                MapMembership.user_id == user_id,
            ),
        )
    )


def media_listing_scope_statement(user_id: UUID) -> Select:
    """Project the narrow reusable relation needed by catalogue metadata."""

    return accessible_media_statement(user_id).with_only_columns(
        Photo.id.label("photo_id"),
        Photo.original_name.label("original_name"),
        Photo.filename.label("filename"),
        Photo.description.label("description"),
        Photo.mime_type.label("mime_type"),
        Photo.file_size_bytes.label("file_size_bytes"),
        Photo.width.label("width"),
        Photo.height.label("height"),
        Photo.path.label("path"),
        Photo.storage_scope_id.label("storage_scope_id"),
        Photo.is_primary.label("is_primary"),
        Photo.created_at.label("created_at"),
        Photo.updated_at.label("updated_at"),
        Photo.uploaded_by_user_id.label("uploaded_by_user_id"),
        Place.name.label("place_name"),
        PoiMap.id.label("map_id"),
        PoiMap.name.label("map_name"),
        Country.iso_alpha2.label("country_code"),
        Country.name.label("country_name"),
        User.id.label("uploader_id"),
        User.display_name.label("uploader_name"),
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
    role = "owner" if poi_map is not None and poi_map.owner_id == current_user.id else membership_role
    if poi_map is None and photo.uploaded_by_user_id == current_user.id:
        role = "owner"
    access = MediaAccess(photo, place, poi_map, country, uploader, role)
    if require_editor and not access.can_edit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor access is required",
        )
    return access


def infer_file_state(photo: Photo) -> str:
    """Declared catalogue state, derived from DB metadata only (AUD-021).

    This is the Python mirror of ``file_state_condition``: the listing never
    touches the storage layer. The physical blob is verified when content is
    actually served, so a blob removed out-of-band stays declared healthy
    until a read fails.
    """

    if photo.path is None or photo.storage_scope_id is None:
        return "missing"
    if photo.width is None or photo.height is None:
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
    columns=None,
) -> Select:
    original_name = columns.original_name if columns is not None else Photo.original_name
    description = columns.description if columns is not None else Photo.description
    mime_type = columns.mime_type if columns is not None else Photo.mime_type
    uploaded_by_user_id = columns.uploaded_by_user_id if columns is not None else Photo.uploaded_by_user_id
    is_primary_column = columns.is_primary if columns is not None else Photo.is_primary
    created_at = columns.created_at if columns is not None else Photo.created_at
    file_size_bytes = columns.file_size_bytes if columns is not None else Photo.file_size_bytes
    width = columns.width if columns is not None else Photo.width
    height = columns.height if columns is not None else Photo.height
    path = columns.path if columns is not None else Photo.path
    storage_scope_id = columns.storage_scope_id if columns is not None else Photo.storage_scope_id
    place_name = columns.place_name if columns is not None else Place.name
    authoritative_map_id = columns.map_id if columns is not None else PoiMap.id
    map_name = columns.map_name if columns is not None else PoiMap.name
    country_code_column = columns.country_code if columns is not None else Country.iso_alpha2

    if query and query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(
                place_name.ilike(pattern),
                map_name.ilike(pattern),
                original_name.ilike(pattern),
                description.ilike(pattern),
            )
        )
    if map_id is not None:
        statement = statement.where(authoritative_map_id == map_id)
    if country_code:
        statement = statement.where(country_code_column == country_code.upper())
    if media_format:
        normalized = media_format.lower().removeprefix("image/")
        statement = statement.where(
            func.lower(func.replace(mime_type, "image/", "")) == normalized
        )
    if uploader_id is not None:
        statement = statement.where(uploaded_by_user_id == uploader_id)
    if is_primary is not None:
        statement = statement.where(is_primary_column.is_(is_primary))
    if created_from is not None:
        statement = statement.where(
            created_at >= datetime.combine(created_from, time.min)
        )
    if created_to is not None:
        statement = statement.where(
            created_at
            < datetime.combine(created_to + timedelta(days=1), time.min)
        )
    if min_size is not None:
        statement = statement.where(file_size_bytes >= min_size)
    if max_size is not None:
        statement = statement.where(file_size_bytes <= max_size)
    if min_width is not None:
        statement = statement.where(width >= min_width)
    if min_height is not None:
        statement = statement.where(height >= min_height)
    if file_state in {"missing", "error", "healthy"}:
        statement = statement.where(
            declared_file_state(path, storage_scope_id, width, height) == file_state
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
