from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.auth.models import User
from app.database import get_db
from app.quotas.models import QuotaProfile, UNLIMITED_PROFILE_ID
from app.quotas.registry import QUOTA_REGISTRY, QuotaKey
from app.quotas.schemas import (
    EffectiveQuotaItem, EffectiveQuotaRead, QuotaLimits, QuotaProfileAssignment,
    QuotaProfileCreate, QuotaProfileRead, QuotaProfileSummary, QuotaProfileUpdate,
    QuotaRegistryRead, registry_response,
)
from app.quotas.service import QuotaService


router = APIRouter(prefix="/admin", tags=["admin-quotas"], dependencies=[Depends(require_admin)])


def _limits(profile: QuotaProfile) -> QuotaLimits:
    return QuotaLimits(**{key.value: getattr(profile, key.value) for key in QUOTA_REGISTRY})


def _summary(profile: QuotaProfile) -> QuotaProfileSummary:
    return QuotaProfileSummary(
        id=profile.id, name=profile.name, is_default=profile.is_default,
        is_system=profile.is_system, is_active=profile.is_active, limits=_limits(profile),
    )


def _read(session: Session, profile: QuotaProfile) -> QuotaProfileRead:
    assigned = session.scalar(select(func.count()).select_from(User).where(User.quota_profile_id == profile.id)) or 0
    return QuotaProfileRead(
        **_summary(profile).model_dump(), description=profile.description,
        assigned_users_count=assigned, created_at=profile.created_at, updated_at=profile.updated_at,
    )


def _apply_limits(profile: QuotaProfile, limits: QuotaLimits) -> None:
    for key, value in limits.model_dump().items():
        setattr(profile, key, value)


def _profile_conflict(error: IntegrityError) -> HTTPException:
    constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
    code = "quota.profile.name_conflict" if constraint == "quota_profiles_name_key" else "quota.profile.conflict"
    return HTTPException(409, detail={"code": code, "params": {}})


@router.get("/quota-registry", response_model=list[QuotaRegistryRead])
def quota_registry() -> list[QuotaRegistryRead]:
    return registry_response()


@router.get("/quota-profiles", response_model=list[QuotaProfileRead])
def list_profiles(session: Session = Depends(get_db)) -> list[QuotaProfileRead]:
    profiles = session.scalars(select(QuotaProfile).order_by(QuotaProfile.is_default.desc(), QuotaProfile.is_active.desc(), func.lower(QuotaProfile.name), QuotaProfile.id)).all()
    return [_read(session, profile) for profile in profiles]


@router.post("/quota-profiles", response_model=QuotaProfileRead, status_code=201)
def create_profile(payload: QuotaProfileCreate, session: Session = Depends(get_db)) -> QuotaProfileRead:
    profile = QuotaProfile(name=payload.name, description=payload.description, is_active=payload.is_active)
    _apply_limits(profile, payload.limits)
    try:
        session.add(profile); session.commit(); session.refresh(profile)
        return _read(session, profile)
    except IntegrityError as error:
        session.rollback(); raise _profile_conflict(error) from error


@router.get("/quota-profiles/{profile_id}", response_model=QuotaProfileRead)
def get_profile(profile_id: UUID, session: Session = Depends(get_db)) -> QuotaProfileRead:
    return _read(session, QuotaService(session).resolve_profile(profile_id, active_only=False))


@router.patch("/quota-profiles/{profile_id}", response_model=QuotaProfileRead)
def update_profile(profile_id: UUID, payload: QuotaProfileUpdate, session: Session = Depends(get_db)) -> QuotaProfileRead:
    profile = QuotaService(session).resolve_profile(profile_id, active_only=False, lock=True)
    if profile.is_system and payload.limits is not None and any(value is not None for value in payload.limits.model_dump().values()):
        raise HTTPException(409, detail={"code": "quota.profile.system_unlimited", "params": {}})
    if payload.name is not None:
        if profile.is_system and payload.name != "Unlimited":
            raise HTTPException(409, detail={"code": "quota.profile.system_protected", "params": {}})
        profile.name = payload.name
    if "description" in payload.model_fields_set:
        profile.description = payload.description
    if payload.is_active is not None:
        if profile.is_system and not payload.is_active:
            raise HTTPException(409, detail={"code": "quota.profile.system_protected", "params": {}})
        if profile.is_default and not payload.is_active:
            raise HTTPException(409, detail={"code": "quota.profile.default_required", "params": {}})
        profile.is_active = payload.is_active
    if payload.limits is not None:
        _apply_limits(profile, payload.limits)
    try:
        session.commit(); session.refresh(profile); return _read(session, profile)
    except IntegrityError as error:
        session.rollback(); raise _profile_conflict(error) from error


@router.post("/quota-profiles/{profile_id}/duplicate", response_model=QuotaProfileRead, status_code=201)
def duplicate_profile(profile_id: UUID, session: Session = Depends(get_db)) -> QuotaProfileRead:
    source = QuotaService(session).resolve_profile(profile_id, active_only=False)
    base = f"Copie de {source.name}"[:100]
    name = base
    suffix = 2
    while session.scalar(select(QuotaProfile.id).where(func.lower(QuotaProfile.name) == name.lower())) is not None:
        marker = f" ({suffix})"; name = f"{base[:100-len(marker)]}{marker}"; suffix += 1
    duplicate = QuotaProfile(name=name, description=source.description, is_active=True)
    _apply_limits(duplicate, _limits(source))
    session.add(duplicate); session.commit(); session.refresh(duplicate)
    return _read(session, duplicate)


@router.post("/quota-profiles/{profile_id}/set-default", response_model=QuotaProfileRead)
def set_default_profile(profile_id: UUID, session: Session = Depends(get_db)) -> QuotaProfileRead:
    profiles = session.scalars(select(QuotaProfile).order_by(QuotaProfile.id).with_for_update()).all()
    target = next((profile for profile in profiles if profile.id == profile_id), None)
    if target is None:
        raise HTTPException(404, detail={"code": "quota.profile.not_found", "params": {}})
    if not target.is_active:
        raise HTTPException(409, detail={"code": "quota.profile.inactive", "params": {}})
    for profile in profiles:
        profile.is_default = profile.id == target.id
    session.commit(); session.refresh(target)
    return _read(session, target)


@router.post("/quota-profiles/{profile_id}/archive", response_model=QuotaProfileRead)
def archive_profile(profile_id: UUID, session: Session = Depends(get_db)) -> QuotaProfileRead:
    profile = QuotaService(session).resolve_profile(profile_id, active_only=False, lock=True)
    assigned = session.scalar(select(func.count()).select_from(User).where(User.quota_profile_id == profile.id)) or 0
    if profile.is_system or profile.is_default:
        raise HTTPException(409, detail={"code": "quota.profile.default_required", "params": {}})
    if assigned:
        raise HTTPException(409, detail={"code": "quota.profile.assigned", "params": {"assigned_users_count": assigned}})
    profile.is_active = False; session.commit(); session.refresh(profile)
    return _read(session, profile)


@router.delete("/quota-profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: UUID, session: Session = Depends(get_db)) -> Response:
    profile = QuotaService(session).resolve_profile(profile_id, active_only=False, lock=True)
    if profile.is_system or profile.is_default:
        raise HTTPException(409, detail={"code": "quota.profile.default_required", "params": {}})
    assigned = session.scalar(select(func.count()).select_from(User).where(User.quota_profile_id == profile.id)) or 0
    if assigned:
        raise HTTPException(409, detail={"code": "quota.profile.assigned", "params": {"assigned_users_count": assigned}})
    session.delete(profile); session.commit(); return Response(status_code=204)


@router.put("/users/{user_id}/quota-profile", response_model=EffectiveQuotaRead)
def assign_profile(user_id: UUID, payload: QuotaProfileAssignment, session: Session = Depends(get_db)) -> EffectiveQuotaRead:
    user = session.scalar(select(User).where(User.id == user_id, User.deleted_at.is_(None)).with_for_update())
    if user is None:
        raise HTTPException(404, detail="User not found")
    profile = QuotaService(session).resolve_profile(payload.quota_profile_id, lock=True)
    user.quota_profile_id = profile.id; session.commit()
    return effective_quotas(user_id, session)


@router.get("/users/{user_id}/quotas", response_model=EffectiveQuotaRead)
def effective_quotas(user_id: UUID, session: Session = Depends(get_db)) -> EffectiveQuotaRead:
    service = QuotaService(session)
    profile = service.effective_profile(user_id)
    items: list[EffectiveQuotaItem] = []
    for key, definition in QUOTA_REGISTRY.items():
        limit = getattr(profile, key.value)
        usage = service.usage(user_id, key) if definition.scope.value == "user" else None
        items.append(EffectiveQuotaItem(
            key=key, scope=definition.scope, limit=limit, usage=usage,
            remaining=None if limit is None or usage is None else max(0, limit - usage),
            unlimited=limit is None, over_limit=limit is not None and usage is not None and usage > limit,
            enforced=definition.enforced,
        ))
    return EffectiveQuotaRead(user_id=user_id, profile=_summary(profile), quotas=items)
