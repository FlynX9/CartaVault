from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_place_role
from app.database import get_db
from app.maps.models import MapMembership, PoiMap
from app.places.history import add_place_history
from app.places.models import Place
from app.trash.schemas import TrashItemRead, TrashItemType
from app.trash.service import permanently_delete_map, purge_expired_trash
from app.trips.models import Trip

router = APIRouter(prefix="/trash", tags=["trash"])


def _days_remaining(purge_after: datetime) -> int:
    remaining = purge_after - datetime.now(UTC).replace(tzinfo=None)
    return max(0, math.ceil(remaining.total_seconds() / 86_400))


def _item(
    *,
    item_id: UUID,
    item_type: TrashItemType,
    name: str,
    map_id: UUID | None,
    map_name: str | None,
    deleted_at: datetime,
    purge_after: datetime,
) -> TrashItemRead:
    return TrashItemRead(
        id=item_id,
        item_type=item_type,
        name=name,
        map_id=map_id,
        map_name=map_name,
        deleted_at=deleted_at,
        purge_after=purge_after,
        days_remaining=_days_remaining(purge_after),
        can_restore=True,
        can_delete_permanently=True,
    )


@router.get("", response_model=list[TrashItemRead])
def list_trash(
    item_type: Literal["all", "map", "place", "trip"] = Query(default="all"),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TrashItemRead]:
    purge_expired_trash(session)
    items: list[TrashItemRead] = []

    if item_type in {"all", "map"}:
        statement = select(PoiMap).where(PoiMap.deleted_at.is_not(None))
        if not user.is_admin:
            statement = statement.where(PoiMap.owner_id == user.id)
        for poi_map in session.scalars(statement).all():
            if poi_map.deleted_at and poi_map.purge_after:
                items.append(_item(item_id=poi_map.id, item_type="map", name=poi_map.name, map_id=poi_map.id, map_name=poi_map.name, deleted_at=poi_map.deleted_at, purge_after=poi_map.purge_after))

    editable_map_ids = select(MapMembership.map_id).where(
        MapMembership.user_id == user.id,
        MapMembership.role.in_(("owner", "editor")),
    )
    owned_map_ids = select(MapMembership.map_id).where(
        MapMembership.user_id == user.id,
        MapMembership.role == "owner",
    )
    place_access = true() if user.is_admin else PoiMap.id.in_(editable_map_ids)
    trip_access = true() if user.is_admin else PoiMap.id.in_(owned_map_ids)

    if item_type in {"all", "place"}:
        rows = session.execute(
            select(Place, PoiMap.name)
            .join(PoiMap, PoiMap.id == Place.map_id)
            .where(Place.deleted_at.is_not(None), PoiMap.deleted_at.is_(None), place_access)
        ).all()
        for place, map_name in rows:
            if place.deleted_at and place.purge_after:
                items.append(_item(item_id=place.id, item_type="place", name=place.name, map_id=place.map_id, map_name=map_name, deleted_at=place.deleted_at, purge_after=place.purge_after))

    if item_type in {"all", "trip"}:
        rows = session.execute(
            select(Trip, PoiMap.name)
            .join(PoiMap, PoiMap.id == Trip.map_id)
            .where(Trip.deleted_at.is_not(None), PoiMap.deleted_at.is_(None), trip_access)
        ).all()
        for trip, map_name in rows:
            if trip.deleted_at and trip.purge_after:
                items.append(_item(item_id=trip.id, item_type="trip", name=trip.name, map_id=trip.map_id, map_name=map_name, deleted_at=trip.deleted_at, purge_after=trip.purge_after))

    return sorted(items, key=lambda item: (item.purge_after, item.item_type, item.name.casefold()))


def _deleted_map(session: Session, item_id: UUID, user: User) -> PoiMap:
    poi_map = session.get(PoiMap, item_id)
    if poi_map is None or poi_map.deleted_at is None:
        raise HTTPException(404, "Deleted map not found")
    if not user.is_admin and poi_map.owner_id != user.id:
        raise HTTPException(404, "Deleted map not found")
    return poi_map


def _deleted_trip(session: Session, item_id: UUID, user: User) -> Trip:
    trip = session.get(Trip, item_id)
    if trip is None or trip.deleted_at is None:
        raise HTTPException(404, "Deleted trip not found")
    require_map_role(session, trip.map_id, user, "owner")
    return trip


@router.post("/{item_type}/{item_id}/restore", status_code=204)
def restore_item(item_type: TrashItemType, item_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    if item_type == "map":
        item = _deleted_map(session, item_id, user)
    elif item_type == "trip":
        item = _deleted_trip(session, item_id, user)
    else:
        item = require_place_role(session, item_id, user, "editor", include_deleted=True)
        if item.deleted_at is None:
            raise HTTPException(404, "Deleted place not found")
        add_place_history(session, item.id, user.id, "restored", {})
    item.deleted_at = None
    item.deleted_by_user_id = None
    item.purge_after = None
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(409, "A conflicting active item prevents restoration") from error
    return Response(status_code=204)


@router.delete("/{item_type}/{item_id}", status_code=204)
def permanently_delete_item(item_type: TrashItemType, item_id: UUID, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    if item_type == "map":
        item = _deleted_map(session, item_id, user)
        permanently_delete_map(session, item.id)
    elif item_type == "trip":
        item = _deleted_trip(session, item_id, user)
        session.delete(item)
    else:
        item = require_place_role(session, item_id, user, "editor", include_deleted=True)
        if item.deleted_at is None:
            raise HTTPException(404, "Deleted place not found")
        session.delete(item)
    session.commit()
    return Response(status_code=204)
