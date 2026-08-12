from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.admin.schemas import (
    AdminUserActivityRead, AdminUserDetails, AdminUserPage, AdminUserRead, AdminUserUpdate, CredentialStatus, CredentialValue, InstanceLogRetentionSettings, MediaUploadSettings,
)
from app.auth.activity import record_user_activity
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import require_admin
from app.auth.avatar_storage import resolve_avatar
from app.auth.models import SystemCredential, User, UserActivityEvent, UserSession
from app.config import credential_settings
from app.database import get_db
from app.emails.providers.base import EmailDeliveryError
from app.emails.service import EmailService, provider_from_database
from app.maps.models import MapMembership, PoiMap
from app.places.models import Place
from app.trips.models import Trip
from app.media.settings import (
    get_max_image_dimension,
    get_max_upload_megabytes,
    set_media_upload_settings,
)
from app.media.optimization import MEDIA_OPTIMIZATION_TASK
from app.instance_status.settings import get_log_retention_days, set_log_retention_days
from app.tasks.schemas import TaskStart
from app.tasks.service import create_task, submit_task


router = APIRouter(prefix="/admin/console", tags=["admin-console"], dependencies=[Depends(require_admin)])


@router.get("/instance/log-retention", response_model=InstanceLogRetentionSettings)
def get_instance_log_retention(session: Session = Depends(get_db)) -> InstanceLogRetentionSettings:
    return InstanceLogRetentionSettings(retention_days=get_log_retention_days(session))


@router.put("/instance/log-retention", response_model=InstanceLogRetentionSettings)
def update_instance_log_retention(payload: InstanceLogRetentionSettings, session: Session = Depends(get_db)) -> InstanceLogRetentionSettings:
    return InstanceLogRetentionSettings(retention_days=set_log_retention_days(session, payload.retention_days))


@router.get("/media/settings", response_model=MediaUploadSettings)
def get_media_upload_settings(session: Session = Depends(get_db)) -> MediaUploadSettings:
    return MediaUploadSettings(
        max_upload_megabytes=get_max_upload_megabytes(session),
        max_image_dimension=get_max_image_dimension(session),
    )


@router.put("/media/settings", response_model=MediaUploadSettings)
def update_media_upload_settings(payload: MediaUploadSettings, session: Session = Depends(get_db)) -> MediaUploadSettings:
    maximum, dimension = set_media_upload_settings(
        session,
        max_upload_megabytes=payload.max_upload_megabytes,
        max_image_dimension=payload.max_image_dimension,
    )
    return MediaUploadSettings(max_upload_megabytes=maximum, max_image_dimension=dimension)


@router.post("/media/optimize", response_model=TaskStart, status_code=status.HTTP_202_ACCEPTED)
def optimize_media(session: Session = Depends(get_db), current: User = Depends(require_admin)) -> TaskStart:
    task = create_task(session, task_type=MEDIA_OPTIMIZATION_TASK, user_id=current.id, map_id=None, resource_type="instance", dedupe_key="media-optimization", max_attempts=1)
    submit_task(session, task)
    return TaskStart(task_id=task.id, status=task.status)


UserCounts = tuple[int, int, int]


def _user_counts(session: Session, user_ids: list[UUID]) -> dict[UUID, UserCounts]:
    if not user_ids:
        return {}

    owned = dict(session.execute(
        select(PoiMap.owner_id, func.count())
        .where(PoiMap.owner_id.in_(user_ids), PoiMap.deleted_at.is_(None))
        .group_by(PoiMap.owner_id)
    ).all())
    shared = dict(session.execute(
        select(MapMembership.user_id, func.count())
        .where(MapMembership.user_id.in_(user_ids), MapMembership.role != "owner")
        .group_by(MapMembership.user_id)
    ).all())
    places = dict(session.execute(
        select(PoiMap.owner_id, func.count())
        .select_from(Place)
        .join(PoiMap, Place.map_id == PoiMap.id)
        .where(
            PoiMap.owner_id.in_(user_ids),
            PoiMap.deleted_at.is_(None),
            Place.deleted_at.is_(None),
        )
        .group_by(PoiMap.owner_id)
    ).all())
    return {
        user_id: (
            int(owned.get(user_id, 0)),
            int(shared.get(user_id, 0)),
            int(places.get(user_id, 0)),
        )
        for user_id in user_ids
    }


def _user_read(session: Session, user: User, counts: UserCounts | None = None) -> AdminUserRead:
    owned, shared, places = counts or _user_counts(session, [user.id])[user.id]
    state = "deleted" if user.deleted_at else "active" if user.is_active else "inactive"
    profile = user.quota_profile
    return AdminUserRead(
        id=user.id, email=user.email, display_name=user.display_name,
        avatar_url=f"/admin/console/users/{user.id}/avatar?v={user.avatar_updated_at.isoformat()}" if user.avatar_filename else None,
        role="admin" if user.is_admin else "user", state=state,
        created_at=user.created_at, updated_at=user.updated_at, last_login_at=user.last_login_at,
        owned_map_count=owned, shared_map_count=shared, place_count=places,
        quota_profile_id=user.quota_profile_id, quota_profile_name=profile.name,
    )


def _user_details(session: Session, user: User) -> AdminUserDetails:
    base = _user_read(session, user)
    trip_count = session.scalar(select(func.count()).select_from(Trip).where(Trip.created_by_user_id == user.id, Trip.deleted_at.is_(None))) or 0
    active_sessions = session.scalar(select(func.count()).select_from(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None), UserSession.expires_at > func.now())) or 0
    return AdminUserDetails(
        **base.model_dump(), trip_count=int(trip_count), active_session_count=int(active_sessions),
        # Account creation currently occurs only after the address has been verified; legacy
        # accounts predate that field and are treated identically by the account API.
        email_verified=True, mfa_enabled=user.totp_enabled or user.email_mfa_enabled,
    )


@router.get("/users/{user_id}/avatar")
def user_avatar(user_id: UUID, session: Session = Depends(get_db)) -> FileResponse:
    user = session.get(User, user_id)
    if user is None or not user.avatar_filename:
        raise HTTPException(404, "Avatar not found")
    path = resolve_avatar(user.avatar_filename)
    if not path.is_file():
        raise HTTPException(404, "Avatar not found")
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "private, max-age=86400"})


@router.get("/users/{user_id}/details", response_model=AdminUserDetails)
def get_user_details(user_id: UUID, session: Session = Depends(get_db)) -> AdminUserDetails:
    user = session.scalar(select(User).options(joinedload(User.quota_profile)).where(User.id == user_id))
    if user is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    return _user_details(session, user)


@router.get("/users/{user_id}/activity", response_model=list[AdminUserActivityRead])
def get_user_activity(user_id: UUID, session: Session = Depends(get_db)) -> list[AdminUserActivityRead]:
    if session.get(User, user_id) is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    actor = User.__table__.alias("activity_actor")
    rows = session.execute(
        select(UserActivityEvent, actor.c.display_name)
        .outerjoin(actor, actor.c.id == UserActivityEvent.actor_user_id)
        .where(UserActivityEvent.user_id == user_id)
        .order_by(UserActivityEvent.occurred_at.desc(), UserActivityEvent.id.desc())
        .limit(100)
    ).all()
    return [AdminUserActivityRead(
        id=event.id, event_type=event.event_type, previous_value=event.previous_value,
        next_value=event.next_value, occurred_at=event.occurred_at, actor_display_name=actor_name,
    ) for event, actor_name in rows]


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
    counts = _user_counts(session, [item.id for item in users])
    return AdminUserPage(
        items=[_user_read(session, item, counts[item.id]) for item in users],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


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
    previous_role = "admin" if user.is_admin else "user"
    previous_state = "active" if user.is_active else "inactive"
    user.is_admin = next_admin
    user.is_active = next_active
    if not next_active:
        session.execute(update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).values(revoked_at=func.now()))
    try:
        if previous_role != ("admin" if next_admin else "user"):
            record_user_activity(session, user_id=user.id, actor_user_id=admin.id, event_type="role_changed", previous_value=previous_role, next_value="admin" if next_admin else "user")
        if previous_state != ("active" if next_active else "inactive"):
            record_user_activity(session, user_id=user.id, actor_user_id=admin.id, event_type="account_state_changed", previous_value=previous_state, next_value="active" if next_active else "inactive")
        session.commit(); session.refresh(user)
    except SQLAlchemyError as error:
        session.rollback()
        raise HTTPException(500, "Impossible de mettre à jour cet utilisateur.") from error
    return _user_read(session, user)


def _credential_statuses(session: Session) -> list[CredentialStatus]:
    resend = session.get(SystemCredential, "resend")
    return [
        CredentialStatus(
            provider="resend", label="Resend", scope="instance", configured=resend is not None,
            editable=True, source="database" if resend else "none",
            masked_value=f"••••{resend.secret_last4}" if resend else None,
            verified_at=resend.verified_at if resend else None, last_used_at=resend.last_used_at if resend else None,
            last_error_code=resend.last_error_code if resend else None,
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
def verify_resend(
    session: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CredentialStatus:
    credential = session.get(SystemCredential, "resend")
    if credential is None:
        raise HTTPException(404, "Aucune clé Resend n’est configurée.")
    try:
        locale = str((admin.preferences or {}).get("language") or "fr")
        # An administrator must be able to validate the stored credential before
        # enabling transactional delivery for the rest of the application.
        EmailService(provider_from_database(session, allow_disabled=True, provider="resend")).send_resend_verification(
            admin.email,
            admin.display_name,
            locale,
        )
    except (CredentialEncryptionError, EmailDeliveryError) as error:
        credential.verified_at = None
        credential.last_error_code = getattr(error, "code", "RESEND_VERIFICATION_FAILED")
        session.commit()
        raise HTTPException(502, "L’envoi de l’email de test Resend a échoué.") from error
    now = datetime.now(UTC).replace(tzinfo=None)
    credential.verified_at = now
    credential.last_used_at = now
    credential.last_error_code = None
    session.commit()
    return next(item for item in _credential_statuses(session) if item.provider == "resend")


@router.delete("/credentials/resend", status_code=status.HTTP_204_NO_CONTENT)
def delete_resend(session: Session = Depends(get_db)) -> None:
    credential = session.get(SystemCredential, "resend")
    if credential is not None:
        session.delete(credential); session.commit()
