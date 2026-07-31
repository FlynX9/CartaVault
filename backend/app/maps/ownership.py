from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService


def accept_ownership_transfer(session: Session, invitation: MapInvitation, new_owner: User) -> None:
    poi_map = invitation.map
    if invitation.created_by_user_id != poi_map.owner_id:
        raise HTTPException(status_code=409, detail="The map owner changed after this transfer request")
    if new_owner.id == poi_map.owner_id:
        raise HTTPException(status_code=409, detail="The recipient already owns this map")
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

    QuotaService(session).ensure_can_create(new_owner.id, QuotaKey.MAPS_MAX)
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

    current_owner.role = "editor"
    session.flush()
    if target is None:
        target = MapMembership(map_id=poi_map.id, user_id=new_owner.id, role="owner")
        session.add(target)
    else:
        target.role = "owner"
    poi_map.owner_id = new_owner.id
