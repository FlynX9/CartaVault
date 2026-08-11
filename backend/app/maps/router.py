from __future__ import annotations

import logging
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
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.map_profiles.service import initialize_map_profile, profile_resource_counts
from app.maps.schemas import (
    InvitationCreate, InvitationRead, MapCreate, MapPlaceFieldConfig, MapRead, MapUpdate,
    MembershipRead, MembershipUpdate, TransferOwnership,
)
from app.places.models import Place
from app.places.fields import normalize_place_field_config
from app.trash.service import trash_deadline
from app.trips.models import Trip

router = APIRouter(prefix="/maps", tags=["maps"])
logger = logging.getLogger(__name__)


def map_to_read(poi_map: PoiMap, access: MapAccess, *, place_count: int, trip_count: int) -> MapRead:
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
        owner_id=poi_map.owner_id, owner_email=poi_map.owner.email,
        owner_display_name=poi_map.owner.display_name, is_private=poi_map.is_private,
        is_shared=len(poi_map.memberships) > 1,
        current_user_role=access.role, can_edit=can_edit, can_delete=access.can_delete,
        can_manage_members=can_manage, can_transfer_ownership=can_manage,
        can_import=can_edit, can_export=True,
        place_count=place_count, trip_count=trip_count,
        place_field_config=normalize_place_field_config(poi_map.place_field_config),
    )


def _map_content_counts(database_session: Session, map_ids: list[UUID]) -> dict[UUID, tuple[int, int]]:
    if not map_ids:
        return {}
    place_counts = (
        select(Place.map_id.label("map_id"), func.count(Place.id).label("place_count"))
        .where(Place.deleted_at.is_(None))
        .group_by(Place.map_id)
        .subquery()
    )
    trip_counts = (
        select(Trip.map_id.label("map_id"), func.count(Trip.id).label("trip_count"))
        .where(Trip.deleted_at.is_(None), Trip.archived_at.is_(None))
        .group_by(Trip.map_id)
        .subquery()
    )
    rows = database_session.execute(
        select(
            PoiMap.id,
            func.coalesce(place_counts.c.place_count, 0),
            func.coalesce(trip_counts.c.trip_count, 0),
        )
        .outerjoin(place_counts, place_counts.c.map_id == PoiMap.id)
        .outerjoin(trip_counts, trip_counts.c.map_id == PoiMap.id)
        .where(PoiMap.id.in_(map_ids))
    )
    return {map_id: (int(place_count), int(trip_count)) for map_id, place_count, trip_count in rows}


def map_to_read_with_counts(database_session: Session, poi_map: PoiMap, access: MapAccess) -> MapRead:
    place_count, trip_count = _map_content_counts(database_session, [poi_map.id]).get(poi_map.id, (0, 0))
    return map_to_read(poi_map, access, place_count=place_count, trip_count=trip_count)


def read_map(database_session: Session, map_id: UUID, *, include_deleted: bool = False) -> PoiMap | None:
    statement = select(PoiMap).options(joinedload(PoiMap.country), joinedload(PoiMap.owner), selectinload(PoiMap.memberships)).where(PoiMap.id == map_id)
    if not include_deleted:
        statement = statement.where(PoiMap.deleted_at.is_(None))
    return database_session.scalar(statement)


def _loaded_map_access(poi_map: PoiMap, current_user: User) -> MapAccess:
    membership = next(
        (item for item in poi_map.memberships if item.user_id == current_user.id),
        None,
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Map not found")
    return MapAccess(poi_map, membership.role)


@router.get("", response_model=list[MapRead])
def get_maps(q: str | None = Query(default=None, min_length=1, max_length=120), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[MapRead]:
    statement = select(PoiMap).options(joinedload(PoiMap.country), joinedload(PoiMap.owner), selectinload(PoiMap.memberships)).where(PoiMap.deleted_at.is_(None))
    statement = statement.join(MapMembership).where(MapMembership.user_id == current_user.id)
    if q is not None:
        statement = statement.where(PoiMap.name.ilike(f"%{q.strip()}%"))
    maps = database_session.scalars(statement.order_by(func.lower(PoiMap.name), PoiMap.id)).unique().all()
    counts = _map_content_counts(database_session, [poi_map.id for poi_map in maps])
    return [
        map_to_read(
            poi_map,
            _loaded_map_access(poi_map, current_user),
            place_count=counts.get(poi_map.id, (0, 0))[0],
            trip_count=counts.get(poi_map.id, (0, 0))[1],
        )
        for poi_map in maps
    ]


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MapRead:
    access = get_map_access(database_session, map_id, current_user)
    poi_map = read_map(database_session, map_id)
    assert poi_map is not None
    return map_to_read_with_counts(database_session, poi_map, access)


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
        category_count, tag_count, status_count = profile_resource_counts(map_data.starter_profile, map_data.profile_options)
        if category_count:
            quotas.ensure_can_create(current_user.id, QuotaKey.CATEGORIES_PER_MAP_MAX, scope_id=poi_map.id, increment=category_count)
        if tag_count:
            quotas.ensure_can_create(current_user.id, QuotaKey.TAGS_PER_MAP_MAX, scope_id=poi_map.id, increment=tag_count)
        quotas.ensure_can_create(current_user.id, QuotaKey.STATUSES_PER_MAP_MAX, scope_id=poi_map.id, increment=status_count)
        database_session.add(MapMembership(map_id=poi_map.id, user_id=current_user.id, role="owner"))
        locale = str((current_user.preferences or {}).get("language") or "fr")
        initialize_map_profile(database_session, poi_map.id, map_data.starter_profile, map_data.profile_options, locale)
        database_session.commit()
        result = read_map(database_session, poi_map.id)
        assert result is not None
        return map_to_read_with_counts(database_session, result, MapAccess(result, "owner"))
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="A map already exists for this owner and country") from error
    except HTTPException:
        database_session.rollback()
        raise
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to initialize the map") from error


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
        return map_to_read_with_counts(database_session, result, access)
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
    access.map.deleted_at, access.map.purge_after = trash_deadline(current_user)
    access.map.deleted_by_user_id = current_user.id
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


@router.post("/{map_id}/transfer-ownership", response_model=InvitationRead, status_code=201)
def transfer_ownership(map_id: UUID, data: TransferOwnership, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> InvitationRead:
    access = require_map_role(database_session, map_id, current_user, "owner")
    email = normalize_email(data.email)
    if email == access.map.owner.email:
        raise HTTPException(status_code=409, detail="The map owner cannot receive a transfer request")
    existing_user = database_session.scalar(select(User).where(User.email == email))
    if existing_user is not None and not existing_user.is_active:
        raise HTTPException(status_code=409, detail="The recipient account is inactive")
    if existing_user is not None and database_session.scalar(
        select(PoiMap.id).where(
            PoiMap.owner_id == existing_user.id,
            PoiMap.country_id == access.map.country_id,
            PoiMap.deleted_at.is_(None),
            PoiMap.id != map_id,
        )
    ) is not None:
        raise HTTPException(status_code=409, detail="The recipient already owns an active map for this country")

    now = datetime.now(UTC).replace(tzinfo=None)
    for pending in database_session.scalars(
        select(MapInvitation).where(
            MapInvitation.map_id == map_id,
            MapInvitation.role == "owner",
            MapInvitation.accepted_at.is_(None),
            MapInvitation.revoked_at.is_(None),
        )
    ):
        pending.revoked_at = now
    database_session.flush()
    quotas = QuotaService(database_session)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.PENDING_INVITATIONS_PER_MAP_MAX, scope_id=map_id)
    quotas.ensure_can_create(access.map.owner_id, QuotaKey.PENDING_INVITATIONS_MAX)

    raw_token = generate_token()
    invitation = MapInvitation(
        map_id=map_id,
        email=email,
        role="owner",
        token_hash=hash_token(raw_token),
        created_by_user_id=current_user.id,
        expires_at=now + timedelta(hours=security_settings.invitation_hours),
    )
    database_session.add(invitation)
    try:
        database_session.commit()
        database_session.refresh(invitation)
    except IntegrityError as error:
        database_session.rollback()
        raise HTTPException(status_code=409, detail="An ownership transfer is already pending") from error

    try:
        locale_source = existing_user if existing_user is not None else current_user
        locale = str((locale_source.preferences or {}).get("language", "fr"))
        EmailService(provider_from_database(database_session)).send_map_ownership_invitation(
            recipient=email,
            owner_email=current_user.email,
            map_name=access.map.name,
            token=raw_token,
            requires_account=existing_user is None,
            locale=locale,
        )
    except EmailDeliveryError as error:
        logger.warning("map_ownership_email_failed map_id=%s invitation_id=%s code=%s", map_id, invitation.id, error.code)
    return InvitationRead.model_validate(invitation, from_attributes=True).model_copy(update={"invitation_url": f"/invitations/{raw_token}"})


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
    try:
        locale_source = existing_user if existing_user is not None else current_user
        locale = str((locale_source.preferences or {}).get("language", "fr"))
        EmailService(provider_from_database(database_session)).send_map_share_invitation(
            recipient=email,
            inviter_email=current_user.email,
            map_name=access.map.name,
            token=raw_token,
            requires_account=existing_user is None,
            locale=locale,
        )
    except EmailDeliveryError as error:
        logger.warning(
            "map_share_email_failed map_id=%s invitation_id=%s code=%s",
            map_id,
            invitation.id,
            error.code,
        )
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
