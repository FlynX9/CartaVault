from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.categories.models import Category
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.places.models import Place
from app.tags.models import Tag

ROLE_RANK = {"viewer": 1, "editor": 2, "owner": 3}


@dataclass(frozen=True)
class MapAccess:
    map: PoiMap
    role: str

    @property
    def can_edit(self) -> bool:
        return self.role in {"admin", "owner", "editor"}

    @property
    def can_delete(self) -> bool:
        return self.role in {"admin", "owner"}

    @property
    def can_manage_members(self) -> bool:
        return self.role in {"admin", "owner"}


def get_map_access(database_session: Session, map_id: UUID, user: User) -> MapAccess:
    poi_map = database_session.get(PoiMap, map_id)
    if poi_map is None:
        raise HTTPException(status_code=404, detail="Map not found")
    if user.is_admin:
        return MapAccess(poi_map, "admin")
    membership = database_session.scalar(
        select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == user.id)
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Map not found")
    return MapAccess(poi_map, membership.role)


def require_map_role(database_session: Session, map_id: UUID, user: User, minimum: str) -> MapAccess:
    access = get_map_access(database_session, map_id, user)
    if access.role != "admin" and ROLE_RANK[access.role] < ROLE_RANK[minimum]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient map permission")
    return access


def require_place_role(
    database_session: Session,
    place_id: UUID,
    user: User,
    minimum: str,
    *,
    include_deleted: bool = False,
) -> Place:
    place = database_session.get(Place, place_id)
    if place is None or (place.deleted_at is not None and not include_deleted):
        raise HTTPException(status_code=404, detail="Place not found")
    require_map_role(database_session, place.map_id, user, minimum)
    return place


def require_photo_role(database_session: Session, photo_id: UUID, user: User, minimum: str) -> Photo:
    photo = database_session.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    require_place_role(database_session, photo.place_id, user, minimum)
    return photo


def require_category_role(database_session: Session, category_id: UUID, user: User, minimum: str) -> Category:
    category = database_session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    require_map_role(database_session, category.map_id, user, minimum)
    return category


def require_tag_role(database_session: Session, tag_id: UUID, user: User, minimum: str) -> Tag:
    tag = database_session.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    require_map_role(database_session, tag.map_id, user, minimum)
    return tag
