from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.models import User, UserApiCredential


def selected_api_key(session: Session, user: User, area: str, provider: str) -> UserApiCredential | None:
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get(area) if isinstance(root.get(area), dict) else {}
    raw_id = settings.get("api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    credential = session.get(UserApiCredential, key_id)
    return credential if credential is not None and credential.user_id == user.id and credential.provider == provider else None


def selected_basemap_api_key(session: Session, user: User, provider: str) -> UserApiCredential | None:
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get("basemaps") if isinstance(root.get("basemaps"), dict) else {}
    raw_id = settings.get(f"{provider}_api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    credential = session.get(UserApiCredential, key_id)
    return credential if credential is not None and credential.user_id == user.id and credential.provider == provider else None


def selected_google_maps_javascript_key(session: Session, user: User) -> UserApiCredential | None:
    root = user.preferences if isinstance(user.preferences, dict) else {}
    settings = root.get("basemaps") if isinstance(root.get("basemaps"), dict) else {}
    raw_id = settings.get("google_maps_js_api_key_id")
    if not isinstance(raw_id, str):
        return None
    try:
        key_id = UUID(raw_id)
    except ValueError:
        return None
    credential = session.get(UserApiCredential, key_id)
    return credential if credential is not None and credential.user_id == user.id and credential.provider == "google" else None


def decrypt_api_key(credential: UserApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


def mark_api_key_used(session: Session, credential: UserApiCredential) -> None:
    now = datetime.now(UTC).replace(tzinfo=None)
    if credential.last_error_code is None and credential.last_used_at is not None and now - credential.last_used_at < timedelta(minutes=5):
        return
    credential.last_used_at = now
    credential.last_error_code = None
    session.commit()


def mark_api_key_error(session: Session, credential: UserApiCredential, code: str) -> None:
    if credential.last_error_code == code:
        return
    credential.last_error_code = code
    session.commit()
