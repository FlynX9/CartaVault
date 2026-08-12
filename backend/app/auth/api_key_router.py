from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.api_keys import decrypt_api_key
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import get_current_session
from app.auth.models import UserApiCredential, UserSession
from app.basemaps.stadia_router import _validate_key as validate_stadia_key
from app.config import GoogleRoutesSettings
from app.database import get_db
from app.trips.routing.base import RoutingError
from app.trips.routing.google import GoogleRoutesProvider
from app.trips.routing.openrouteservice import OpenRouteServiceProvider
from app.trips.routing.registry import google_routing_rate_limiter


router = APIRouter(prefix="/account/api-keys", tags=["account"])


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str
    api_key: str = Field(min_length=1, max_length=512)


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    api_key: str | None = Field(default=None, min_length=1, max_length=512)


def _serialize(key: UserApiCredential) -> dict[str, object]:
    return {
        "id": key.id,
        "name": key.name,
        "provider": key.provider,
        "last4": key.secret_last4,
        "verified": key.verified_at is not None,
        "verified_at": key.verified_at,
        "last_used_at": key.last_used_at,
        "last_error_code": key.last_error_code,
        "last_error_status": key.last_error_status,
        "last_error_message": key.last_error_message,
        "last_error_at": key.last_error_at,
        "created_at": key.created_at,
        "updated_at": key.updated_at,
        "editable": True,
    }


def _clean(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned or any(ord(character) < 33 or ord(character) > 126 for character in cleaned):
        raise HTTPException(422, {"code": "API_KEY_INVALID", "message": f"La clé {label} est invalide."})
    return cleaned


@router.get("")
def list_api_keys(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> list[dict[str, object]]:
    rows = session.scalars(select(UserApiCredential).where(UserApiCredential.user_id == current.user_id).order_by(UserApiCredential.provider, UserApiCredential.name)).all()
    return [_serialize(row) for row in rows]


@router.post("")
def create_api_key(data: ApiKeyCreate, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    if data.provider not in {"google", "stadia", "openrouteservice"}:
        raise HTTPException(422, {"code": "API_KEY_PROVIDER_INVALID", "message": "Le fournisseur doit être Google, Stadia ou OpenRouteService."})
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(_clean(data.api_key, data.provider.title()))
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
    key = UserApiCredential(user_id=current.user_id, provider=data.provider, name=data.name.strip(), encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=data.api_key.strip()[-4:])
    session.add(key); session.commit(); session.refresh(key)
    return _serialize(key)


@router.patch("/{key_id}")
def update_api_key(key_id: UUID, data: ApiKeyUpdate, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    key = session.scalar(select(UserApiCredential).where(UserApiCredential.id == key_id, UserApiCredential.user_id == current.user_id))
    if key is None:
        raise HTTPException(404, {"code": "API_KEY_NOT_FOUND", "message": "Clé API introuvable."})
    if data.name is not None:
        key.name = data.name.strip()
    if data.api_key is not None:
        try:
            secret = _clean(data.api_key, key.provider.title())
            encrypted = CredentialEncryptionService.from_settings().encrypt(secret)
        except CredentialEncryptionError as error:
            raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
        key.encrypted_secret = encrypted.ciphertext; key.encryption_version = encrypted.version; key.secret_last4 = secret[-4:]
        key.verified_at = None; key.last_used_at = None; key.last_error_code = None
        key.last_error_status = None; key.last_error_message = None; key.last_error_at = None
    session.commit(); session.refresh(key)
    return _serialize(key)


@router.post("/{key_id}/verify")
def verify_api_key(key_id: UUID, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    key = session.scalar(select(UserApiCredential).where(UserApiCredential.id == key_id, UserApiCredential.user_id == current.user_id))
    if key is None:
        raise HTTPException(404, {"code": "API_KEY_NOT_FOUND", "message": "Clé API introuvable."})
    try:
        secret = decrypt_api_key(key)
        if key.provider == "google":
            google_routing_rate_limiter.check(f"api-key-verify:{current.user_id}")
            GoogleRoutesProvider(secret, GoogleRoutesSettings(routing_preference="TRAFFIC_UNAWARE")).calculate_route([(2.3522, 48.8566), (2.3601, 48.8610)])
        elif key.provider == "stadia":
            validate_stadia_key(secret)
        else:
            OpenRouteServiceProvider(secret).calculate_route([(2.3522, 48.8566), (2.3601, 48.8610)])
    except (HTTPException, RoutingError) as error:
        detail = error.detail if isinstance(error, HTTPException) else None
        key.verified_at = None
        key.last_error_code = str(detail.get("code")) if isinstance(detail, dict) else getattr(error, "code", "API_KEY_TEST_FAILED")
        key.last_error_status = (detail.get("provider_status") if isinstance(detail, dict) else None) or (error.status_code if isinstance(error, HTTPException) else getattr(error, "http_status", None))
        key.last_error_message = str(detail.get("message")) if isinstance(detail, dict) and detail.get("message") else str(error)
        key.last_error_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()
        raise HTTPException(422, {"code": key.last_error_code, "message": key.last_error_message, "provider_status": key.last_error_status}) from error
    key.verified_at = datetime.now(UTC).replace(tzinfo=None); key.last_error_code = None
    key.last_error_status = None; key.last_error_message = None; key.last_error_at = None
    session.commit(); return _serialize(key)


@router.delete("/{key_id}")
def delete_api_key(key_id: UUID, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    key = session.scalar(select(UserApiCredential).where(UserApiCredential.id == key_id, UserApiCredential.user_id == current.user_id))
    if key is None:
        raise HTTPException(404, {"code": "API_KEY_NOT_FOUND", "message": "Clé API introuvable."})
    preferences = dict(current.user.preferences or {})
    for area in ("routing", "places", "basemaps"):
        settings = preferences.get(area)
        if isinstance(settings, dict) and str(settings.get("api_key_id") or "") == str(key_id):
            preferences[area] = {**settings, "api_key_id": None}
    current.user.preferences = preferences
    session.delete(key); session.commit()
    return {"deleted": True}
