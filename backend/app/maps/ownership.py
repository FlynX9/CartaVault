from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.categories.models import Category
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place, PlaceLink
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.statuses.models import PlaceStatus
from app.tags.models import Tag
from app.trips.models import Trip, TripDay, TripNight, TripNightPhoto, TripStop


def _count(session: Session, statement) -> int:
    return int(session.scalar(statement) or 0)


def _maximum_group_count(session: Session, model, group_column, *filters) -> int:
    return int(session.scalar(
        select(func.count())
        .select_from(model)
        .where(*filters)
        .group_by(group_column)
        .order_by(func.count().desc())
        .limit(1)
    ) or 0)


def _ensure_destination_capacity(
    session: Session,
    invitation: MapInvitation,
    poi_map: PoiMap,
    new_owner: User,
    target_membership: MapMembership | None,
) -> None:
    quotas = QuotaService(session)
    now = datetime.now(UTC).replace(tzinfo=None)
    active_trips = _count(
        session,
        select(func.count()).select_from(Trip).where(
            Trip.map_id == poi_map.id,
            Trip.deleted_at.is_(None),
        ),
    )
    place_ids = select(Place.id).where(Place.map_id == poi_map.id)
    place_media = select(Photo.file_size_bytes).where(
        or_(
            Photo.place_id.in_(place_ids),
            (Photo.place_id.is_(None)) & (Photo.map_id == poi_map.id),
        )
    ).subquery()
    night_media = (
        select(TripNightPhoto.file_size_bytes)
        .join(TripNight, TripNight.id == TripNightPhoto.night_id)
        .join(Trip, Trip.id == TripNight.trip_id)
        .where(Trip.map_id == poi_map.id)
        .subquery()
    )
    photo_count = _count(session, select(func.count()).select_from(place_media))
    photo_count += _count(session, select(func.count()).select_from(night_media))
    storage_bytes = _count(session, select(func.coalesce(func.sum(place_media.c.file_size_bytes), 0)))
    storage_bytes += _count(session, select(func.coalesce(func.sum(night_media.c.file_size_bytes), 0)))
    pending_invitations = _count(
        session,
        select(func.count()).select_from(MapInvitation).where(
            MapInvitation.map_id == poi_map.id,
            MapInvitation.id != invitation.id,
            MapInvitation.accepted_at.is_(None),
            MapInvitation.revoked_at.is_(None),
            MapInvitation.expires_at > now,
        ),
    )

    quotas.ensure_can_create(new_owner.id, QuotaKey.MAPS_MAX)
    if active_trips:
        quotas.ensure_can_create(new_owner.id, QuotaKey.TRIPS_TOTAL_MAX, increment=active_trips)
    if photo_count:
        quotas.ensure_can_create(new_owner.id, QuotaKey.PHOTOS_TOTAL_MAX, increment=photo_count)
    if storage_bytes:
        quotas.ensure_can_create(new_owner.id, QuotaKey.STORAGE_BYTES_MAX, increment=storage_bytes)
    if target_membership is None:
        quotas.ensure_can_create(new_owner.id, QuotaKey.MEMBERSHIPS_TOTAL_MAX)
    if pending_invitations:
        quotas.ensure_can_create(
            new_owner.id,
            QuotaKey.PENDING_INVITATIONS_MAX,
            increment=pending_invitations,
        )

    map_scope_usage = {
        QuotaKey.PLACES_PER_MAP_MAX: quotas.usage(new_owner.id, QuotaKey.PLACES_PER_MAP_MAX, poi_map.id),
        QuotaKey.TAGS_PER_MAP_MAX: _count(session, select(func.count()).select_from(Tag).where(Tag.map_id == poi_map.id)),
        QuotaKey.CATEGORIES_PER_MAP_MAX: _count(session, select(func.count()).select_from(Category).where(Category.map_id == poi_map.id)),
        QuotaKey.STATUSES_PER_MAP_MAX: _count(session, select(func.count()).select_from(PlaceStatus).where(PlaceStatus.map_id == poi_map.id)),
        QuotaKey.TRIPS_PER_MAP_MAX: quotas.usage(new_owner.id, QuotaKey.TRIPS_PER_MAP_MAX, poi_map.id),
        QuotaKey.MEMBERS_PER_MAP_MAX: _count(session, select(func.count()).select_from(MapMembership).where(MapMembership.map_id == poi_map.id)) + int(target_membership is None),
        QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX: pending_invitations,
    }
    for key, usage in map_scope_usage.items():
        quotas.ensure_usage_within_limit(new_owner.id, key, usage)

    all_trip_ids = select(Trip.id).where(Trip.map_id == poi_map.id)
    all_day_ids = select(TripDay.id).where(TripDay.trip_id.in_(all_trip_ids))
    nested_scope_usage = {
        QuotaKey.PHOTOS_PER_PLACE_MAX: _maximum_group_count(session, Photo, Photo.place_id, Photo.place_id.in_(place_ids)),
        QuotaKey.LINKS_PER_PLACE_MAX: _maximum_group_count(session, PlaceLink, PlaceLink.place_id, PlaceLink.place_id.in_(place_ids)),
        QuotaKey.DAYS_PER_TRIP_MAX: _maximum_group_count(session, TripDay, TripDay.trip_id, TripDay.trip_id.in_(all_trip_ids)),
        QuotaKey.STEPS_PER_DAY_MAX: _maximum_group_count(session, TripStop, TripStop.trip_day_id, TripStop.trip_day_id.in_(all_day_ids)),
    }
    for key, usage in nested_scope_usage.items():
        quotas.ensure_usage_within_limit(new_owner.id, key, usage)


def accept_ownership_transfer(session: Session, invitation: MapInvitation, new_owner: User) -> None:
    poi_map = session.scalar(
        select(PoiMap)
        .where(PoiMap.id == invitation.map_id, PoiMap.deleted_at.is_(None))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if poi_map is None:
        raise HTTPException(status_code=409, detail="The transferred map is no longer active")
    if invitation.created_by_user_id != poi_map.owner_id:
        raise HTTPException(status_code=409, detail="The map owner changed after this transfer request")
    if new_owner.id == poi_map.owner_id:
        raise HTTPException(status_code=409, detail="The recipient already owns this map")
    locked_users = session.scalars(
        select(User)
        .where(User.id.in_((poi_map.owner_id, new_owner.id)))
        .order_by(User.id)
        .with_for_update()
    ).all()
    if len(locked_users) != 2:
        raise HTTPException(status_code=409, detail="Map ownership users are inconsistent")
    conflicting_map = session.scalar(
        select(PoiMap.id).where(
            PoiMap.owner_id == new_owner.id,
            PoiMap.country_id == poi_map.country_id,
            PoiMap.deleted_at.is_(None),
            PoiMap.id != poi_map.id,
        )
    )
    if conflicting_map is not None:
        raise HTTPException(status_code=409, detail="The recipient already owns an active map for this country")

    current_owner = session.scalar(
        select(MapMembership).where(
            MapMembership.map_id == poi_map.id,
            MapMembership.user_id == poi_map.owner_id,
            MapMembership.role == "owner",
        )
    )
    if current_owner is None:
        raise HTTPException(status_code=409, detail="Current ownership is inconsistent")
    target = session.scalar(
        select(MapMembership).where(
            MapMembership.map_id == poi_map.id,
            MapMembership.user_id == new_owner.id,
        )
    )

    _ensure_destination_capacity(session, invitation, poi_map, new_owner, target)

    current_owner.role = "editor"
    session.flush()
    if target is None:
        target = MapMembership(map_id=poi_map.id, user_id=new_owner.id, role="owner")
        session.add(target)
    else:
        target.role = "owner"
    poi_map.owner_id = new_owner.id
