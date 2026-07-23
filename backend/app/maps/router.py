from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import MapAccess, get_map_access, require_map_role
from app.auth.schemas import UserRead
from app.auth.security import generate_token, hash_token, normalize_email
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.config import security_settings
from app.countries.catalog import load_country_bounds
from app.countries.models import Country
from app.countries.schemas import CountrySummary
from app.database import get_db
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.maps.schemas import (
    InvitationCreate, InvitationRead, MapCreate, MapPlaceFieldConfig, MapRead, MapUpdate,
    MembershipRead, MembershipUpdate, TransferOwnership,
)
from app.places.models import Place
from app.places.fields import normalize_place_field_config
from app.statuses.service import create_default_statuses

router = APIRouter(prefix="/maps", tags=["maps"])


def map_to_read(poi_map: PoiMap, access: MapAccess) -> MapRead:
    country = poi_map.country
    catalogue_bounds = load_country_bounds().get(country.iso_alpha2)
    min_longitude, min_latitude, max_longitude, max_latitude = (
        catalogue_bounds if catalogue_bounds is not None else (None, None, None, None)
    )
    can_edit = access.can_edit
    can_manage = access.can_manage_members
    return MapRead(
        id=poi_map.id, name=poi_map.name, country_id=poi_map.country_id,
        country=CountrySummary(id=country.id, iso_alpha2=country.iso_alpha2, iso_alpha3=country.iso_alpha3, name=country.name),
        center_latitude=poi_map.center_latitude, center_longitude=poi_map.center_longitude,
        default_zoom=poi_map.default_zoom,
        effective_center_latitude=poi_map.center_latitude if poi_map.center_latitude is not None else country.center_latitude,
        effective_center_longitude=poi_map.center_longitude if poi_map.center_longitude is not None else country.center_longitude,
        effective_default_zoom=poi_map.default_zoom if poi_map.default_zoom is not None else country.default_zoom,
        min_latitude=country.min_latitude if country.min_latitude is not None else min_latitude,
        max_latitude=country.max_latitude if country.max_latitude is not None else max_latitude,
        min_longitude=country.min_longitude if country.min_longitude is not None else min_longitude,
        max_longitude=country.max_longitude if country.max_longitude is not None else max_longitude,
        created_at=poi_map.created_at, updated_at=poi_map.updated_at,
        owner_id=poi_map.owner_id, is_private=poi_map.is_private,
        is_shared=len(poi_map.memberships) > 1,
        current_user_role=access.role, can_edit=can_edit, can_delete=access.can_delete,
        can_manage_members=can_manage, can_transfer_ownership=can_manage,
        can_import=can_edit, can_export=True,
        place_field_config=normalize_place_field_config(poi_map.place_field_config),
    )


def read_map(database_session: Session, map_id: UUID) -> PoiMap | None:
    return database_session.scalar(select(PoiMap).options(joinedload(PoiMap.country), selectinload(PoiMap.memberships)).where(PoiMap.id == map_id))


@router.get("", response_model=list[MapRead])
def get_maps(q: str | None = Query(default=None, min_length=1, max_length=120), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[MapRead]:
    statement = select(PoiMap).options(joinedload(PoiMap.country), selectinload(PoiMap.memberships))
    if not current_user.is_admin:
        statement = statement.join(MapMembership).where(MapMembership.user_id == current_user.id)
    if q is not None:
        statement = statement.where(PoiMap.name.ilike(f"%{q.strip()}%"))
    maps = database_session.scalars(statement.order_by(func.lower(PoiMap.name), PoiMap.id)).unique().all()
    return [map_to_read(poi_map, get_map_access(database_session, poi_map.id, current_user)) for poi_map in maps]


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapRead:
    access = get_map_access(database_session, map_id, current_user)
    poi_map = read_map(database_session, map_id)
    assert poi_map is not None
    return map_to_read(poi_map, access)


@router.post("", response_model=MapRead, status_code=201)
def create_map(map_data: MapCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapRead:
    quotas = QuotaService(database_session)
    quotas.ensure_can_create(current_user.id, QuotaKey.MAPS_MAX)
    country = database_session.get(Country, map_data.country_id)
    if country is None:
        raise HTTPException(status_code=404, detail="Country not found")
    poi_map = PoiMap(
        country_id=country.id, owner_id=current_user.id, is_private=True,
        name=map_data.name.strip() if map_data.name is not None else country.name,
        center_latitude=map_data.center_latitude, center_longitude=map_data.center_longitude,
        default_zoom=map_data.default_zoom,
    )
    try:
        database_session.add(poi_map)
        database_session.flush()
        quotas.ensure_can_create(current_user.id, QuotaKey.STATUSES_PER_MAP_MAX, scope_id=poi_map.id, increment=5)
        database_session.add(MapMembership(map_id=poi_map.id, user_id=current_user.id, role="owner"))
        create_default_statuses(database_session, poi_map.id)
        database_session.commit()
        result = read_map(database_session, poi_map.id)
        assert result is not None
        return map_to_read(result, MapAccess(result, "owner" if not current_user.is_admin else "admin"))
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A map already exists for this owner and country") from error


@router.patch("/{map_id}", response_model=MapRead)
def update_map(map_id: UUID, map_data: MapUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapRead:
    access = require_map_role(database_session, map_id, current_user, "owner")
    supplied = map_data.model_dump(exclude_unset=True)
    if "name" in supplied:
        supplied["name"] = supplied["name"].strip()
    for field_name, value in supplied.items():
        setattr(access.map, field_name, value)
    try:
        database_session.commit()
        result = read_map(database_session, map_id)
        assert result is not None
        return map_to_read(result, access)
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to update the map") from error


@router.get("/{map_id}/place-fields", response_model=MapPlaceFieldConfig)
def get_place_field_config(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapPlaceFieldConfig:
    access = require_map_role(database_session, map_id, current_user, "viewer")
    return MapPlaceFieldConfig(fields=normalize_place_field_config(access.map.place_field_config))


@router.put("/{map_id}/place-fields", response_model=MapPlaceFieldConfig)
def update_place_field_config(map_id: UUID, data: MapPlaceFieldConfig, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapPlaceFieldConfig:
    access = require_map_role(database_session, map_id, current_user, "editor")
    access.map.place_field_config = data.fields
    database_session.commit()
    return MapPlaceFieldConfig(fields=normalize_place_field_config(access.map.place_field_config))


@router.delete("/{map_id}", status_code=204)
def delete_map(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    access = require_map_role(database_session, map_id, current_user, "owner")
    if database_session.scalar(select(func.count()).select_from(Place).where(Place.map_id == map_id)):
        raise HTTPException(status_code=409, detail="The map cannot be deleted while it contains places")
    database_session.delete(access.map)
    database_session.commit()
    return Response(status_code=204)


def _membership_read(membership: MapMembership) -> MembershipRead:
    return MembershipRead(user=UserRead.model_validate(membership.user, from_attributes=True), role=membership.role, created_at=membership.created_at, updated_at=membership.updated_at)


@router.get("/{map_id}/members", response_model=list[MembershipRead])
def list_members(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[MembershipRead]:
    require_map_role(database_session, map_id, current_user, "owner")
    memberships = database_session.scalars(select(MapMembership).join(MapMembership.user).options(joinedload(MapMembership.user)).where(MapMembership.map_id == map_id).order_by(MapMembership.role, func.lower(User.email))).all()
    return [_membership_read(item) for item in memberships]


@router.patch("/{map_id}/members/{user_id}", response_model=MembershipRead)
def update_member(map_id: UUID, user_id: UUID, data: MembershipUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MembershipRead:
    require_map_role(database_session, map_id, current_user, "owner")
    membership = database_session.scalar(select(MapMembership).options(joinedload(MapMembership.user)).where(MapMembership.map_id == map_id, MapMembership.user_id == user_id))
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="Use ownership transfer for the owner")
    membership.role = data.role
    database_session.commit()
    return _membership_read(membership)


@router.delete("/{map_id}/members/{user_id}", status_code=204)
def delete_member(map_id: UUID, user_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    require_map_role(database_session, map_id, current_user, "owner")
    membership = database_session.scalar(select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == user_id))
    if membership is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="The owner cannot be removed")
    database_session.delete(membership)
    database_session.commit()
    return Response(status_code=204)


@router.delete("/{map_id}/members/me", status_code=204)
def leave_map(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    membership = database_session.scalar(select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == current_user.id))
    if membership is None:
        raise HTTPException(status_code=404, detail="Map not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="Transfer ownership before leaving")
    database_session.delete(membership)
    database_session.commit()
    return Response(status_code=204)


@router.post("/{map_id}/transfer-ownership", response_model=MapRead)
def transfer_ownership(map_id: UUID, data: TransferOwnership, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapRead:
    access = require_map_role(database_session, map_id, current_user, "owner")
    new_owner = database_session.scalar(select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == data.new_owner_user_id))
    old_owner = database_session.scalar(select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == access.map.owner_id))
    if new_owner is None:
        raise HTTPException(status_code=409, detail="The new owner must already be a map member")
    if old_owner is None or old_owner.role != "owner":
        raise HTTPException(status_code=409, detail="Current ownership is inconsistent")
    QuotaService(database_session).ensure_can_create(new_owner.user_id, QuotaKey.MAPS_MAX)
    old_owner.role = "editor"
    database_session.flush()
    new_owner.role = "owner"
    access.map.owner_id = new_owner.user_id
    database_session.commit()
    result = read_map(database_session, map_id)
    assert result is not None
    return map_to_read(result, get_map_access(database_session, map_id, current_user))


@router.post("/{map_id}/invitations", response_model=InvitationRead, status_code=201)
def create_invitation(map_id: UUID, data: InvitationCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> InvitationRead:
    access = require_map_role(database_session, map_id, current_user, "owner")
    quotas = QuotaService(database_session)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX, scope_id=map_id)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.PENDING_INVITATIONS_MAX)
    email = normalize_email(data.email)
    if access.map.owner.email == email:
        raise HTTPException(status_code=409, detail="The map owner cannot be invited")
    existing_user = database_session.scalar(select(User).where(User.email == email))
    if existing_user and database_session.scalar(select(MapMembership).where(MapMembership.map_id == map_id, MapMembership.user_id == existing_user.id)):
        raise HTTPException(status_code=409, detail="This user is already a map member")
    raw_token = generate_token()
    invitation = MapInvitation(
        map_id=map_id, email=email, role=data.role, token_hash=hash_token(raw_token),
        created_by_user_id=current_user.id,
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=security_settings.invitation_hours),
    )
    database_session.add(invitation)
    database_session.commit()
    database_session.refresh(invitation)
    return InvitationRead.model_validate(invitation, from_attributes=True).model_copy(update={"invitation_url": f"/invitations/{raw_token}"})


@router.get("/{map_id}/invitations", response_model=list[InvitationRead])
def list_invitations(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[InvitationRead]:
    require_map_role(database_session, map_id, current_user, "owner")
    return [InvitationRead.model_validate(item, from_attributes=True) for item in database_session.scalars(select(MapInvitation).where(MapInvitation.map_id == map_id).order_by(MapInvitation.created_at.desc()))]


@router.delete("/{map_id}/invitations/{invitation_id}", status_code=204)
def revoke_invitation(map_id: UUID, invitation_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    require_map_role(database_session, map_id, current_user, "owner")
    invitation = database_session.scalar(select(MapInvitation).where(MapInvitation.id == invitation_id, MapInvitation.map_id == map_id))
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    database_session.commit()
    return Response(status_code=204)
