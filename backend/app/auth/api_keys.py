from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.api_key_capabilities import ApiKeyCapability, default_capabilities, supports_capability
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import AdminApiCredential, User, UserApiCredential
from app.quotas.models import QuotaProfileApiCredential


ApiCredential = UserApiCredential | AdminApiCredential


def accessible_instance_api_keys(session: Session, user: User) -> list[AdminApiCredential]:
    return list(session.scalars(
        select(AdminApiCredential)
        .join(QuotaProfileApiCredential, QuotaProfileApiCredential.admin_api_credential_id == AdminApiCredential.id)
        .where(
            QuotaProfileApiCredential.quota_profile_id == user.quota_profile_id,
            AdminApiCredential.provider != "resend",
        )
        .order_by(AdminApiCredential.provider, AdminApiCredential.name, AdminApiCredential.id)
    ).all())


def _accessible_credential(
    session: Session, user: User, key_id: UUID, provider: str, capability: ApiKeyCapability
) -> ApiCredential | None:
    personal = session.get(UserApiCredential, key_id)
    if personal is not None and personal.user_id == user.id and personal.provider == provider:
        return personal if capability in default_capabilities(provider) else None
    instance = session.scalar(
        select(AdminApiCredential)
        .join(QuotaProfileApiCredential, QuotaProfileApiCredential.admin_api_credential_id == AdminApiCredential.id)
        .where(
            AdminApiCredential.id == key_id,
            AdminApiCredential.provider == provider,
            QuotaProfileApiCredential.quota_profile_id == user.quota_profile_id,
        )
    )
    return instance if instance is not None and supports_capability(provider, instance.capabilities, capability) else None


def selected_api_key(session: Session, user: User, area: str, provider: str) -> ApiCredential | None:
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get(area) if isinstance(root.get(area), dict) else {}
    raw_id = settings.get("api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    capability: ApiKeyCapability = "routing" if area == "routing" else "places_search"
    return _accessible_credential(session, user, key_id, provider, capability)


def selected_basemap_api_key(
    session: Session, user: User, provider: str, capability: ApiKeyCapability = "satellite_basemap"
) -> ApiCredential | None:
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get("basemaps") if isinstance(root.get("basemaps"), dict) else {}
    scoped_field = "classic_api_key_id" if capability == "classic_basemap" else "satellite_api_key_id"
    raw_id = settings.get(scoped_field) or settings.get(f"{provider}_api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    return _accessible_credential(session, user, key_id, provider, capability)


def selected_google_maps_javascript_key(
    session: Session,
    user: User,
    capability: ApiKeyCapability = "satellite_basemap",
) -> ApiCredential | None:
    if capability == "classic_basemap":
        return selected_basemap_api_key(session, user, "google", capability)
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get("basemaps") if isinstance(root.get("basemaps"), dict) else {}
    raw_id = settings.get("google_maps_js_api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    return _accessible_credential(session, user, key_id, "google", "satellite_basemap")


def decrypt_api_key(credential: ApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


def mark_api_key_used(session: Session, credential: ApiCredential) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    if credential.last_error_code is None and credential.last_used_at is not None and now - credential.last_used_at < timedelta(minutes=5):
        return
    credential.last_used_at = now
    credential.last_error_code = None
    session.commit()


def mark_api_key_error(session: Session, credential: ApiCredential, code: str) -> None:
    if credential.last_error_code == code:
        return
    credential.last_error_code = code
    session.commit()
