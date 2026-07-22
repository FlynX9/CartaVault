from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.admin.schemas import QuotaLimits, QuotaUsage, UserQuotaRead
from app.auth.models import User
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.photos.storage import MAX_PHOTO_SIZE, get_photo_storage_root
from app.places.models import Place


SETTING_KEY = "quota_limits"
DEFAULT_LIMITS = QuotaLimits(photo_file_bytes=MAX_PHOTO_SIZE)


def global_limits(session: Session) -> QuotaLimits:
    setting = session.get(SystemSetting, SETTING_KEY)
    return QuotaLimits.model_validate(setting.value) if setting else DEFAULT_LIMITS


def save_global_limits(session: Session, limits: QuotaLimits) -> QuotaLimits:
    setting = session.get(SystemSetting, SETTING_KEY)
    value = limits.model_dump()
    if setting is None:
        session.add(SystemSetting(key=SETTING_KEY, value=value))
    else:
        setting.value = value
    session.commit()
    return limits


def user_overrides(user: User) -> QuotaLimits:
    raw = user.preferences.get("quota_limits", {}) if isinstance(user.preferences, dict) else {}
    return QuotaLimits.model_validate(raw if isinstance(raw, dict) else {})


def effective_limits(session: Session, user: User) -> QuotaLimits:
    base = global_limits(session).model_dump()
    for key, value in user_overrides(user).model_dump().items():
        if value is not None:
            base[key] = value
    return QuotaLimits.model_validate(base)


def save_user_overrides(session: Session, user: User, limits: QuotaLimits) -> QuotaLimits:
    preferences = dict(user.preferences or {})
    preferences["quota_limits"] = {key: value for key, value in limits.model_dump().items() if value is not None}
    user.preferences = preferences
    session.commit()
    return limits


def _storage_for_user(session: Session, user_id: UUID) -> int | None:
    filenames = session.scalars(
        select(Photo.path).join(Place, Photo.place_id == Place.id).join(PoiMap, Place.map_id == PoiMap.id)
        .where(PoiMap.owner_id == user_id, Place.deleted_at.is_(None), Photo.path.is_not(None))
    )
    try:
        root = get_photo_storage_root()
        total = 0
        for filename in filenames:
            path = (root / str(filename)).resolve()
            path.relative_to(root)
            if path.is_file():
                total += path.stat().st_size
        return total
    except (OSError, ValueError):
        return None


def usage_for_user(session: Session, user: User) -> QuotaUsage:
    maps = session.scalar(select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == user.id)) or 0
    places = session.scalar(select(func.count()).select_from(Place).join(PoiMap).where(PoiMap.owner_id == user.id, Place.deleted_at.is_(None))) or 0
    photos = session.scalar(select(func.count()).select_from(Photo).join(Place).join(PoiMap).where(PoiMap.owner_id == user.id, Place.deleted_at.is_(None))) or 0
    memberships = session.scalar(select(func.count()).select_from(MapMembership).join(PoiMap).where(PoiMap.owner_id == user.id)) or 0
    return QuotaUsage(maps=maps, places=places, photos=photos, photo_storage_bytes=_storage_for_user(session, user.id), memberships=memberships)


def quota_for_user(session: Session, user: User) -> UserQuotaRead:
    return UserQuotaRead(user_id=user.id, display_name=user.display_name, email=user.email, limits=effective_limits(session, user), overrides=user_overrides(user), usage=usage_for_user(session, user))


def require_available(current: int, limit: int | None, code: str, label: str) -> None:
    if limit is not None and current >= limit:
        raise HTTPException(status_code=409, detail={"code": code, "message": f"La limite de {label} est atteinte."})
