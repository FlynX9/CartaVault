from __future__ import annotations

import json
import os
import shutil
from datetime import UTC, datetime
from math import ceil
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.admin.quota_service import global_limits, quota_for_user, save_global_limits, save_user_overrides, usage_for_user
from app.admin.schemas import (
    AdminUserPage, AdminUserRead, AdminUserUpdate, CredentialStatus, CredentialValue,
    InstanceCounts, InstanceHealth, QuotaLimits, QuotaOverview, ServiceHealth, UserQuotaRead,
)
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import require_admin
from app.auth.models import SystemCredential, User, UserApiCredential, UserSession
from app.config import credential_settings, email_settings, routing_settings
from app.database import get_db
from app.maps.models import MapMembership, PoiMap
from app.photos.models import Photo
from app.photos.storage import get_photo_storage_root
from app.places.models import Place


router = APIRouter(prefix="/admin/console", tags=["admin-console"], dependencies=[Depends(require_admin)])


def _user_read(session: Session, user: User) -> AdminUserRead:
    owned = session.scalar(select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == user.id)) or 0
    shared = session.scalar(select(func.count()).select_from(MapMembership).where(MapMembership.user_id == user.id, MapMembership.role != "owner")) or 0
    state = "deleted" if user.deleted_at else "active" if user.is_active else "inactive"
    return AdminUserRead(
        id=user.id, email=user.email, display_name=user.display_name,
        role="admin" if user.is_admin else "user", state=state,
        created_at=user.created_at, updated_at=user.updated_at, last_login_at=user.last_login_at,
        owned_map_count=owned, shared_map_count=shared,
    )


@router.get("/users", response_model=AdminUserPage)
def list_users(
    q: str | None = Query(default=None, max_length=320),
    role: str | None = Query(default=None, pattern="^(admin|user)$"),
    state: str | None = Query(default=None, pattern="^(active|inactive|deleted)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_db),
) -> AdminUserPage:
    filters = []
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
    if role:
        filters.append(User.is_admin.is_(role == "admin"))
    if state == "active":
        filters.extend((User.is_active.is_(True), User.deleted_at.is_(None)))
    elif state == "inactive":
        filters.extend((User.is_active.is_(False), User.deleted_at.is_(None)))
    elif state == "deleted":
        filters.append(User.deleted_at.is_not(None))
    total = session.scalar(select(func.count()).select_from(User).where(*filters)) or 0
    users = session.scalars(
        select(User).where(*filters).order_by(func.lower(User.email), User.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return AdminUserPage(items=[_user_read(session, item) for item in users], total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)))


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(
    user_id: UUID, payload: AdminUserUpdate, session: Session = Depends(get_db), admin: User = Depends(require_admin),
) -> AdminUserRead:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    if user.deleted_at is not None:
        raise HTTPException(409, detail={"code": "ADMIN_USER_DELETED", "message": "Un compte supprimé ne peut pas être modifié."})
    next_admin = payload.role == "admin" if payload.role is not None else user.is_admin
    next_active = payload.is_active if payload.is_active is not None else user.is_active
    removes_admin = user.is_admin and user.is_active and (not next_admin or not next_active)
    if user.id == admin.id and removes_admin:
        raise HTTPException(409, detail={"code": "ADMIN_SELF_PROTECTION", "message": "Vous ne pouvez pas désactiver ou rétrograder votre propre compte administrateur."})
    if removes_admin:
        active_admins = session.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True), User.is_active.is_(True), User.deleted_at.is_(None))) or 0
        if active_admins <= 1:
            raise HTTPException(409, detail={"code": "LAST_ADMIN_PROTECTED", "message": "Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé."})
    user.is_admin = next_admin
    user.is_active = next_active
    if not next_active:
        session.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=func.now()))
    try:
        session.commit(); session.refresh(user)
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(500, "Impossible de mettre à jour cet utilisateur.") from error
    return _user_read(session, user)


def _credential_statuses(session: Session) -> list[CredentialStatus]:
    resend = session.get(SystemCredential, "resend")
    personal_count = session.scalar(select(func.count()).select_from(UserApiCredential).where(UserApiCredential.provider == "google_routes")) or 0
    return [
        CredentialStatus(
            provider="resend", label="Resend", scope="instance", configured=resend is not None,
            editable=True, source="database" if resend else "none",
            masked_value=f"••••{resend.secret_last4}" if resend else None,
            verified_at=resend.verified_at if resend else None, last_used_at=resend.last_used_at if resend else None,
            last_error_code=resend.last_error_code if resend else None,
        ),
        CredentialStatus(
            provider="google_routes", label="Google Routes (clés personnelles)", scope="personal",
            configured=personal_count > 0, editable=False, source="database" if personal_count else "none",
            configured_user_count=personal_count,
        ),
        CredentialStatus(
            provider="credential_encryption", label="Clé maîtresse de chiffrement", scope="infrastructure",
            configured=bool(credential_settings.encryption_key), editable=False,
            source="environment" if credential_settings.encryption_key else "none",
        ),
    ]


@router.get("/credentials", response_model=list[CredentialStatus])
def list_credentials(session: Session = Depends(get_db)) -> list[CredentialStatus]:
    return _credential_statuses(session)


@router.put("/credentials/resend", response_model=CredentialStatus)
def put_resend(payload: CredentialValue, session: Session = Depends(get_db)) -> CredentialStatus:
    value = payload.value.strip()
    if not value.startswith("re_") or any(ord(character) < 33 for character in value):
        raise HTTPException(422, "Une clé API Resend valide est requise.")
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(value)
    except CredentialEncryptionError as error:
        raise HTTPException(503, "Le stockage chiffré des credentials n’est pas configuré.") from error
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        credential = SystemCredential(provider="resend", encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=value[-4:])
        session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext; credential.encryption_version = encrypted.version; credential.secret_last4 = value[-4:]
    credential.verified_at = None; credential.last_error_code = None
    session.commit()
    return next(item for item in _credential_statuses(session) if item.provider == "resend")


@router.post("/credentials/resend/verify", response_model=CredentialStatus)
def verify_resend(session: Session = Depends(get_db)) -> CredentialStatus:
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        raise HTTPException(404, "Aucune clé Resend n’est configurée.")
    try:
        value = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
        request = Request("https://api.resend.com/domains", headers={"Authorization": f"Bearer {value}", "Accept": "application/json"})
        with urlopen(request, timeout=email_settings.timeout_seconds) as response:  # noqa: S310 - fixed provider endpoint
            if response.status >= 400:
                raise HTTPError(request.full_url, response.status, "provider error", response.headers, None)
        credential.verified_at = datetime.now(UTC).replace(tzinfo=None); credential.last_error_code = None
    except (CredentialEncryptionError, HTTPError, URLError, TimeoutError, OSError) as error:
        credential.verified_at = None; credential.last_error_code = "RESEND_VERIFICATION_FAILED"
        session.commit()
        raise HTTPException(502, "La vérification Resend a échoué.") from error
    session.commit()
    return next(item for item in _credential_statuses(session) if item.provider == "resend")


@router.delete("/credentials/resend", status_code=status.HTTP_204_NO_CONTENT)
def delete_resend(session: Session = Depends(get_db)) -> None:
    credential = session.get(SystemCredential, "resend")
    if credential is not None:
        session.delete(credential); session.commit()


@router.get("/quotas", response_model=QuotaOverview)
def quota_overview(session: Session = Depends(get_db)) -> QuotaOverview:
    users = session.scalars(select(User).where(User.deleted_at.is_(None)).order_by(func.lower(User.email))).all()
    entries = [quota_for_user(session, user) for user in users]
    aggregate = {
        "maps": sum(item.usage.maps for item in entries), "places": sum(item.usage.places for item in entries),
        "photos": sum(item.usage.photos for item in entries),
        "photo_storage_bytes": None if any(item.usage.photo_storage_bytes is None for item in entries) else sum(item.usage.photo_storage_bytes or 0 for item in entries),
        "memberships": sum(item.usage.memberships for item in entries),
    }
    return QuotaOverview(global_limits=global_limits(session), aggregate_usage=aggregate, users=entries, unavailable_metrics=["imports", "exports", "route_calculations", "google_routes_requests"])


@router.put("/quotas", response_model=QuotaLimits)
def update_global_quotas(payload: QuotaLimits, session: Session = Depends(get_db)) -> QuotaLimits:
    return save_global_limits(session, payload)


@router.patch("/quotas/users/{user_id}", response_model=UserQuotaRead)
def update_user_quotas(user_id: UUID, payload: QuotaLimits, session: Session = Depends(get_db)) -> UserQuotaRead:
    user = session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, "Utilisateur introuvable.")
    save_user_overrides(session, user, payload)
    return quota_for_user(session, user)


def _safe_service(action, unavailable: str) -> ServiceHealth:
    try:
        return action()
    except Exception:  # Each diagnostic is deliberately isolated.
        return ServiceHealth(status="unavailable", detail=unavailable)


@router.get("/instance", response_model=InstanceHealth)
def instance_health(session: Session = Depends(get_db)) -> InstanceHealth:
    database = _safe_service(lambda: ServiceHealth(status="ok", detail="PostgreSQL répond.", version=session.scalar(text("SELECT version()"))), "PostgreSQL est indisponible.")
    postgis = _safe_service(lambda: ServiceHealth(status="ok", detail="PostGIS répond.", version=session.scalar(text("SELECT PostGIS_Version()"))), "PostGIS est indisponible.")
    revision = _safe_service(lambda: ServiceHealth(status="ok", detail="Révision Alembic active.", version=session.scalar(text("SELECT version_num FROM alembic_version"))), "Révision Alembic indisponible.")
    root = _safe_service(lambda: ServiceHealth(status="ok", detail="Stockage accessible." if get_photo_storage_root().exists() else "Stockage prêt, dossier non créé."), "Stockage inaccessible.")
    disk_total = disk_free = None
    try:
        disk = shutil.disk_usage(get_photo_storage_root().parent); disk_total = disk.total; disk_free = disk.free
    except OSError:
        pass
    def check_osrm() -> ServiceHealth:
        request = Request(f"{routing_settings.base_url.rstrip('/')}/route/v1/{routing_settings.profile}/2.3522,48.8566;2.3530,48.8570?overview=false", headers={"User-Agent": "CartaVault-health/1.0"})
        with urlopen(request, timeout=min(routing_settings.timeout_seconds, 3)) as response:  # noqa: S310 - configured routing provider
            payload = json.load(response)
        return ServiceHealth(status="ok" if payload.get("code") == "Ok" else "warning", detail="OSRM répond." if payload.get("code") == "Ok" else "OSRM a répondu avec un état inattendu.")
    osrm = _safe_service(check_osrm, "OSRM ne répond pas actuellement.")
    resend = session.get(SystemCredential, "resend")
    counts = InstanceCounts(
        users=session.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None))) or 0,
        maps=session.scalar(select(func.count()).select_from(PoiMap)) or 0,
        places=session.scalar(select(func.count()).select_from(Place).where(Place.deleted_at.is_(None))) or 0,
        photos=session.scalar(select(func.count()).select_from(Photo)) or 0,
    )
    return InstanceHealth(
        application_version=os.getenv("CARTAVAULT_VERSION", "0.1.0"), checked_at=datetime.now(UTC), database_revision=revision.version,
        database=database, postgis=postgis, storage=root, disk_total_bytes=disk_total, disk_free_bytes=disk_free,
        credential_encryption=ServiceHealth(status="ok" if credential_settings.encryption_key else "warning", detail="Clé de chiffrement configurée." if credential_settings.encryption_key else "Clé de chiffrement absente."),
        osrm=osrm, email=ServiceHealth(status="ok" if resend else "warning", detail="Resend configuré." if resend else "Aucun fournisseur email configuré."),
        recent_errors=ServiceHealth(status="warning", detail="Aucun mécanisme persistant d’erreurs contrôlées n’est disponible."), counts=counts,
    )
