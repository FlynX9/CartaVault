from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.categories.models import Category
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.basemaps.models import GoogleSatelliteUsageDaily
from app.places.models import Place, PlaceLink
from app.quotas.models import QuotaProfile, UNLIMITED_PROFILE_ID
from app.quotas.registry import QUOTA_REGISTRY, QuotaKey
from app.statuses.models import PlaceStatus
from app.tags.models import Tag
from app.trips.models import Trip, TripDay, TripNight, TripNightPhoto, TripStop


class QuotaService:
    NON_MEASURABLE_KEYS = {
        QuotaKey.IMAGE_UPLOAD_MEGABYTES_MAX,
        QuotaKey.IMAGE_DIMENSION_MAX,
    }

    def __init__(self, session: Session):
        self.session = session

    def default_profile(self, *, lock: bool = False) -> QuotaProfile:
        statement = select(QuotaProfile).where(QuotaProfile.is_default.is_(True), QuotaProfile.is_active.is_(True))
        if lock:
            statement = statement.with_for_update()
        profile = self.session.scalar(statement)
        if profile is None:
            raise HTTPException(500, detail={"code": "quota.profile.default_required", "params": {}})
        return profile

    def resolve_profile(self, profile_id: UUID | None = None, *, active_only: bool = True, lock: bool = False) -> QuotaProfile:
        if profile_id is None:
            return self.default_profile(lock=lock)
        statement = select(QuotaProfile).where(QuotaProfile.id == profile_id)
        if lock:
            statement = statement.with_for_update()
        profile = self.session.scalar(statement)
        if profile is None:
            raise HTTPException(404, detail={"code": "quota.profile.not_found", "params": {"profile_id": str(profile_id)}})
        if active_only and not profile.is_active:
            raise HTTPException(409, detail={"code": "quota.profile.inactive", "params": {"profile_id": str(profile_id)}})
        return profile

    def effective_profile(self, user_id: UUID, *, lock: bool = False) -> QuotaProfile:
        statement = select(User).where(User.id == user_id)
        if lock:
            statement = statement.with_for_update()
        user = self.session.scalar(statement)
        if user is None:
            raise HTTPException(404, detail="User not found")
        return self.resolve_profile(user.quota_profile_id, active_only=False)

    def _owner_id(self, key: QuotaKey, scope_id: UUID | None, user_id: UUID) -> UUID:
        if key in {QuotaKey.MAPS_MAX, QuotaKey.TRIPS_TOTAL_MAX, QuotaKey.STORAGE_BYTES_MAX, QuotaKey.PHOTOS_TOTAL_MAX, QuotaKey.MEMBERSHIPS_TOTAL_MAX, QuotaKey.PENDING_INVITATIONS_MAX, QuotaKey.GOOGLE_SATELLITE_TILES_DAILY_MAX, QuotaKey.GOOGLE_SATELLITE_TILES_MONTHLY_MAX}:
            return user_id
        if scope_id is None:
            raise ValueError(f"scope_id is required for {key.value}")
        if key in {QuotaKey.PLACES_PER_MAP_MAX, QuotaKey.TAGS_PER_MAP_MAX, QuotaKey.CATEGORIES_PER_MAP_MAX, QuotaKey.STATUSES_PER_MAP_MAX, QuotaKey.TRIPS_PER_MAP_MAX, QuotaKey.MEMBERS_PER_MAP_MAX, QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX}:
            owner_id = self.session.scalar(select(PoiMap.owner_id).where(PoiMap.id == scope_id))
        elif key in {QuotaKey.PHOTOS_PER_PLACE_MAX, QuotaKey.LINKS_PER_PLACE_MAX}:
            owner_id = self.session.scalar(select(PoiMap.owner_id).join(Place, Place.map_id == PoiMap.id).where(Place.id == scope_id))
        elif key == QuotaKey.DAYS_PER_TRIP_MAX:
            owner_id = self.session.scalar(select(PoiMap.owner_id).join(Trip, Trip.map_id == PoiMap.id).where(Trip.id == scope_id))
        else:
            owner_id = self.session.scalar(select(PoiMap.owner_id).join(Trip, Trip.map_id == PoiMap.id).join(TripDay, TripDay.trip_id == Trip.id).where(TripDay.id == scope_id))
        if owner_id is None:
            raise HTTPException(404, detail={"code": "quota.scope.not_found", "params": {"scope_id": str(scope_id)}})
        return owner_id

    def usage(self, owner_id: UUID, key: QuotaKey, scope_id: UUID | None = None) -> int:
        if key in self.NON_MEASURABLE_KEYS:
            raise ValueError(f"{key.value} is a configuration limit and has no usage counter")
        now = datetime.now(UTC).replace(tzinfo=None)
        if key == QuotaKey.PHOTOS_TOTAL_MAX:
            place_photos = self.session.scalar(
                select(func.count()).select_from(Photo).join(Place).join(PoiMap).where(PoiMap.owner_id == owner_id)
            ) or 0
            night_photos = self.session.scalar(
                select(func.count())
                .select_from(TripNightPhoto)
                .join(TripNight, TripNight.id == TripNightPhoto.night_id)
                .join(Trip, Trip.id == TripNight.trip_id)
                .join(PoiMap, PoiMap.id == Trip.map_id)
                .where(PoiMap.owner_id == owner_id)
            ) or 0
            return int(place_photos + night_photos)
        if key in {QuotaKey.GOOGLE_SATELLITE_TILES_DAILY_MAX, QuotaKey.GOOGLE_SATELLITE_TILES_MONTHLY_MAX}:
            today = datetime.now(UTC).date()
            period_start = today if key == QuotaKey.GOOGLE_SATELLITE_TILES_DAILY_MAX else today.replace(day=1)
            return int(self.session.scalar(
                select(func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_started), 0)).where(
                    GoogleSatelliteUsageDaily.user_id == owner_id,
                    GoogleSatelliteUsageDaily.usage_date >= period_start,
                )
            ) or 0)
        statements = {
            QuotaKey.MAPS_MAX: select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == owner_id, PoiMap.deleted_at.is_(None)),
            QuotaKey.TRIPS_TOTAL_MAX: select(func.count()).select_from(Trip).join(PoiMap).where(PoiMap.owner_id == owner_id, PoiMap.deleted_at.is_(None), Trip.deleted_at.is_(None)),
            QuotaKey.MEMBERSHIPS_TOTAL_MAX: select(func.count()).select_from(MapMembership).where(MapMembership.user_id == owner_id),
            QuotaKey.PENDING_INVITATIONS_MAX: select(func.count()).select_from(MapInvitation).join(PoiMap).where(PoiMap.owner_id == owner_id, MapInvitation.accepted_at.is_(None), MapInvitation.revoked_at.is_(None), MapInvitation.expires_at > now),
            QuotaKey.PLACES_PER_MAP_MAX: select(func.count()).select_from(Place).where(Place.map_id == scope_id, Place.deleted_at.is_(None)),
            QuotaKey.TAGS_PER_MAP_MAX: select(func.count()).select_from(Tag).where(Tag.map_id == scope_id),
            QuotaKey.CATEGORIES_PER_MAP_MAX: select(func.count()).select_from(Category).where(Category.map_id == scope_id),
            QuotaKey.STATUSES_PER_MAP_MAX: select(func.count()).select_from(PlaceStatus).where(PlaceStatus.map_id == scope_id),
            QuotaKey.TRIPS_PER_MAP_MAX: select(func.count()).select_from(Trip).where(Trip.map_id == scope_id, Trip.deleted_at.is_(None)),
            QuotaKey.MEMBERS_PER_MAP_MAX: select(func.count()).select_from(MapMembership).where(MapMembership.map_id == scope_id),
            QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX: select(func.count()).select_from(MapInvitation).where(MapInvitation.map_id == scope_id, MapInvitation.accepted_at.is_(None), MapInvitation.revoked_at.is_(None), MapInvitation.expires_at > now),
            QuotaKey.PHOTOS_PER_PLACE_MAX: select(func.count()).select_from(Photo).where(Photo.place_id == scope_id),
            QuotaKey.LINKS_PER_PLACE_MAX: select(func.count()).select_from(PlaceLink).where(PlaceLink.place_id == scope_id),
            QuotaKey.DAYS_PER_TRIP_MAX: select(func.count()).select_from(TripDay).where(TripDay.trip_id == scope_id),
            QuotaKey.STEPS_PER_DAY_MAX: select(func.count()).select_from(TripStop).where(TripStop.trip_day_id == scope_id),
        }
        if key == QuotaKey.STORAGE_BYTES_MAX:
            return self.storage_usage(owner_id)
        return int(self.session.scalar(statements[key]) or 0)

    def storage_usage(self, owner_id: UUID) -> int:
        place_bytes = self.session.scalar(
            select(func.coalesce(func.sum(Photo.file_size_bytes), 0)).join(Place).join(PoiMap).where(PoiMap.owner_id == owner_id)
        ) or 0
        night_bytes = self.session.scalar(
            select(func.coalesce(func.sum(TripNightPhoto.file_size_bytes), 0))
            .join(TripNight, TripNight.id == TripNightPhoto.night_id)
            .join(Trip, Trip.id == TripNight.trip_id)
            .join(PoiMap, PoiMap.id == Trip.map_id)
            .where(PoiMap.owner_id == owner_id)
        ) or 0
        return int(place_bytes + night_bytes)

    def ensure_can_create(self, user_id: UUID, key: QuotaKey, *, scope_id: UUID | None = None, increment: int = 1) -> tuple[int, int | None]:
        if increment < 0:
            raise ValueError("quota increment cannot be negative")
        owner_id = self._owner_id(key, scope_id, user_id)
        # The owner row serializes competing creates for every quota owned by that account.
        owner = self.session.scalar(select(User).where(User.id == owner_id).with_for_update())
        if owner is None:
            raise HTTPException(404, detail="User not found")
        profile = self.resolve_profile(owner.quota_profile_id, active_only=False)
        limit = getattr(profile, key.value)
        usage = self.usage(owner_id, key, scope_id)
        if limit is not None and usage + increment > limit:
            raise HTTPException(
                409,
                detail={
                    "code": f"quota.{key.value.removesuffix('_max')}.limit_reached",
                    "params": {"limit": limit, "usage": usage, "requested_increment": increment, "quota_profile": profile.name},
                },
            )
        return usage, limit
