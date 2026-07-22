from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.admin.schemas import (
    AdminUserPage, AdminUserRead, AdminUserUpdate, CredentialStatus, CredentialValue,
)
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import require_admin
from app.auth.models import SystemCredential, User, UserApiCredential, UserSession
from app.config import credential_settings, email_settings
from app.database import get_db
from app.maps.models import MapMembership, PoiMap


router = APIRouter(prefix="/admin/console", tags=["admin-console"], dependencies=[Depends(require_admin)])


def _user_read(session: Session, user: User) -> AdminUserRead:
    owned = session.scalar(select(func.count()).select_from(PoiMap).where(PoiMap.owner_id == user.id)) or 0
    shared = session.scalar(select(func.count()).select_from(MapMembership).where(MapMembership.user_id == user.id, MapMembership.role != "owner")) or 0
    state = "deleted" if user.deleted_at else "active" if user.is_active else "inactive"
    profile = user.quota_profile
    return AdminUserRead(
        id=user.id, email=user.email, display_name=user.display_name,
        role="admin" if user.is_admin else "user", state=state,
        created_at=user.created_at, updated_at=user.updated_at, last_login_at=user.last_login_at,
        owned_map_count=owned, shared_map_count=shared,
        quota_profile_id=user.quota_profile_id, quota_profile_name=profile.name,
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
        select(User).options(joinedload(User.quota_profile)).where(*filters).order_by(func.lower(User.email), User.id).offset((page - 1) * page_size).limit(page_size)
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
