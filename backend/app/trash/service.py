from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.models import User
from app.maps.models import PoiMap
from app.places.models import Place
from app.photos.models import Photo
from app.photos.storage import InvalidPhotoPathError, PhotoStorageError, delete_photo_file, delete_photo_thumbnail
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.trips.models import Trip, TripNight, TripNightPhoto


logger = logging.getLogger(__name__)


DEFAULT_RETENTION_DAYS = 30
MIN_RETENTION_DAYS = 1
MAX_RETENTION_DAYS = 365


def lock_and_ensure_restore_capacity(
    session: Session,
    item: PoiMap | Place | Trip,
) -> PoiMap | Place | Trip:
    """Lock one trashed resource and validate only usage reactivated by restore."""

    locked = session.scalar(
        select(type(item))
        .where(type(item).id == item.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked is None or locked.deleted_at is None:
        raise HTTPException(status_code=409, detail="The item is no longer in the trash")

    quotas = QuotaService(session)
    if isinstance(locked, PoiMap):
        quotas.ensure_map_restore_capacity(locked)
    elif isinstance(locked, Place):
        parent_map = session.scalar(
            select(PoiMap)
            .where(PoiMap.id == locked.map_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if parent_map is None or parent_map.deleted_at is not None:
            raise HTTPException(status_code=409, detail="Restore the parent map first")
        quotas.ensure_can_create(
            parent_map.owner_id,
            QuotaKey.PLACES_PER_MAP_MAX,
            scope_id=locked.map_id,
        )
    else:
        parent_map = session.scalar(
            select(PoiMap)
            .where(PoiMap.id == locked.map_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if parent_map is None or parent_map.deleted_at is not None:
            raise HTTPException(status_code=409, detail="Restore the parent map first")
        quotas.ensure_can_create(
            parent_map.owner_id,
            QuotaKey.TRIPS_PER_MAP_MAX,
            scope_id=locked.map_id,
        )
        quotas.ensure_can_create(parent_map.owner_id, QuotaKey.TRIPS_TOTAL_MAX)
    return locked


@dataclass(frozen=True)
class PhotoCleanupTarget:
    relative_path: str
    storage_scope_id: UUID
    photo_id: UUID
    has_thumbnail: bool


def retention_days(user: User) -> int:
    raw = (user.preferences or {}).get("trash_retention_days", DEFAULT_RETENTION_DAYS)
    if isinstance(raw, bool):
        return DEFAULT_RETENTION_DAYS
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_DAYS
    return max(MIN_RETENTION_DAYS, min(MAX_RETENTION_DAYS, value))


def trash_deadline(user: User, *, now: datetime | None = None) -> tuple[datetime, datetime]:
    deleted_at = (now or datetime.now(UTC)).replace(tzinfo=None)
    return deleted_at, deleted_at + timedelta(days=retention_days(user))


def _place_photo_targets(session: Session, place_ids: list[UUID]) -> list[PhotoCleanupTarget]:
    if not place_ids:
        return []
    rows = session.execute(
        select(Photo.path, Photo.storage_scope_id, Photo.id).where(
            Photo.place_id.in_(place_ids),
            Photo.path.is_not(None),
            Photo.storage_scope_id.is_not(None),
        )
    ).all()
    return [PhotoCleanupTarget(path, scope_id, photo_id, True) for path, scope_id, photo_id in rows]


def _map_photo_targets(session: Session, map_ids: list[UUID]) -> list[PhotoCleanupTarget]:
    if not map_ids:
        return []
    place_ids = select(Place.id).where(Place.map_id.in_(map_ids))
    rows = session.execute(
        select(Photo.path, Photo.storage_scope_id, Photo.id).where(
            or_(Photo.map_id.in_(map_ids), Photo.place_id.in_(place_ids)),
            Photo.path.is_not(None),
            Photo.storage_scope_id.is_not(None),
        )
    ).all()
    return [PhotoCleanupTarget(path, scope_id, photo_id, True) for path, scope_id, photo_id in rows]


def _trip_photo_targets(session: Session, trip_ids: list[UUID]) -> list[PhotoCleanupTarget]:
    if not trip_ids:
        return []
    rows = session.execute(
        select(TripNightPhoto.file_path, TripNightPhoto.night_id, TripNightPhoto.id)
        .join(TripNight, TripNight.id == TripNightPhoto.night_id)
        .where(TripNight.trip_id.in_(trip_ids))
    ).all()
    return [PhotoCleanupTarget(path, night_id, photo_id, False) for path, night_id, photo_id in rows]


def _cleanup_photo_targets(session: Session, targets: list[PhotoCleanupTarget]) -> None:
    if not targets:
        return
    paths = {target.relative_path for target in targets}
    thumbnail_ids = {target.photo_id for target in targets if target.has_thumbnail}
    try:
        referenced_paths = set(session.scalars(select(Photo.path).where(Photo.path.in_(paths))).all())
        referenced_paths.update(session.scalars(select(TripNightPhoto.file_path).where(TripNightPhoto.file_path.in_(paths))).all())
        referenced_thumbnail_ids = set(session.scalars(select(Photo.id).where(Photo.id.in_(thumbnail_ids))).all())
        referenced_thumbnail_ids.update(session.scalars(select(TripNightPhoto.id).where(TripNightPhoto.id.in_(thumbnail_ids))).all())
    except SQLAlchemyError:
        session.rollback()
        logger.warning("Unable to verify references for purged media; physical cleanup was skipped", exc_info=True)
        return

    for target in targets:
        if target.relative_path not in referenced_paths:
            try:
                delete_photo_file(target.relative_path, target.storage_scope_id, target.photo_id)
            except InvalidPhotoPathError:
                try:
                    scope, filename = PurePosixPath(target.relative_path).parts
                    delete_photo_file(target.relative_path, UUID(scope), UUID(PurePosixPath(filename).stem))
                except (PhotoStorageError, ValueError):
                    logger.warning(
                        "Unable to delete purged media",
                        extra={"photo_id": str(target.photo_id), "relative_path": target.relative_path},
                        exc_info=True,
                    )
            except PhotoStorageError:
                logger.warning(
                    "Unable to delete purged media",
                    extra={"photo_id": str(target.photo_id), "relative_path": target.relative_path},
                    exc_info=True,
                )
        if target.has_thumbnail and target.photo_id not in referenced_thumbnail_ids:
            try:
                delete_photo_thumbnail(target.photo_id)
            except PhotoStorageError:
                logger.warning(
                    "Unable to delete purged media thumbnail",
                    extra={"photo_id": str(target.photo_id)},
                    exc_info=True,
                )


def _delete_map_rows(session: Session, map_id: UUID) -> None:
    # Places use RESTRICT toward maps, while trips cascade. Delete dependants in
    # an explicit order so the operation remains deterministic on every schema.
    session.execute(delete(Trip).where(Trip.map_id == map_id))
    session.execute(delete(Place).where(Place.map_id == map_id))
    session.execute(delete(PoiMap).where(PoiMap.id == map_id))


def _commit_and_cleanup(session: Session, targets: list[PhotoCleanupTarget]) -> None:
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    _cleanup_photo_targets(session, targets)


def permanently_delete_map(session: Session, map_id: UUID) -> None:
    targets = _map_photo_targets(session, [map_id])
    targets.extend(_trip_photo_targets(session, session.scalars(select(Trip.id).where(Trip.map_id == map_id)).all()))
    _delete_map_rows(session, map_id)
    _commit_and_cleanup(session, targets)


def permanently_delete_place(session: Session, place_id: UUID) -> None:
    targets = _place_photo_targets(session, [place_id])
    session.execute(delete(Place).where(Place.id == place_id))
    _commit_and_cleanup(session, targets)


def permanently_delete_trip(session: Session, trip_id: UUID) -> None:
    targets = _trip_photo_targets(session, [trip_id])
    session.execute(delete(Trip).where(Trip.id == trip_id))
    _commit_and_cleanup(session, targets)


def purge_expired_trash(session: Session, *, now: datetime | None = None) -> dict[str, int]:
    threshold = (now or datetime.now(UTC)).replace(tzinfo=None)
    map_ids = session.scalars(
        select(PoiMap.id).where(PoiMap.deleted_at.is_not(None), PoiMap.purge_after <= threshold)
    ).all()
    trip_ids = session.scalars(
        select(Trip.id).where(
            Trip.deleted_at.is_not(None),
            Trip.purge_after <= threshold,
            ~Trip.map_id.in_(map_ids),
        )
    ).all()
    place_ids = session.scalars(
        select(Place.id).where(
            Place.deleted_at.is_not(None),
            Place.purge_after <= threshold,
            ~Place.map_id.in_(map_ids),
        )
    ).all()
    targets = _map_photo_targets(session, map_ids)
    map_trip_ids = session.scalars(select(Trip.id).where(Trip.map_id.in_(map_ids))).all() if map_ids else []
    targets.extend(_trip_photo_targets(session, [*map_trip_ids, *trip_ids]))
    targets.extend(_place_photo_targets(session, place_ids))
    for map_id in map_ids:
        _delete_map_rows(session, map_id)

    session.execute(delete(Trip).where(Trip.id.in_(trip_ids)))
    session.execute(delete(Place).where(Place.id.in_(place_ids)))
    _commit_and_cleanup(session, targets)
    return {
        "maps": len(map_ids),
        "trips": len(trip_ids),
        "places": len(place_ids),
    }
