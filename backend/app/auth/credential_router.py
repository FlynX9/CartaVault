from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import get_current_session
from app.auth.models import UserApiCredential, UserSession
from app.auth.schemas import AccountPreferences
from app.auth.security import verify_password
from app.config import GoogleRoutesSettings
from app.database import get_db
from app.trips.routing.base import RoutingError
from app.trips.routing.google import GoogleRoutesProvider
from app.trips.routing.registry import google_routing_rate_limiter


router = APIRouter(prefix="/account/integrations/google-routes", tags=["account"])
PROVIDER = "google_routes"
VERIFY_COORDINATES = [(2.3522, 48.8566), (2.3601, 48.8610)]
MAX_API_KEY_LENGTH = 512


def _credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == PROVIDER))


def _status(credential: UserApiCredential | None) -> dict[str, object]:
    return {
        "configured": credential is not None,
        "last4": credential.secret_last4 if credential else None,
        "verified": credential is not None and credential.verified_at is not None,
        "verified_at": credential.verified_at if credential else None,
        "last_used_at": credential.last_used_at if credential else None,
        "last_error_code": credential.last_error_code if credential else None,
    }


async def _json_object(request: Request) -> dict[str, object]:
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."}) from error
    if not isinstance(payload, dict):
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."})
    return payload


@router.get("")
def credential_status(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    return _status(_credential(session, current.user_id))


@router.put("")
async def store_credential(request: Request, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    payload = await _json_object(request)
    value = payload.get("api_key")
    if not isinstance(value, str):
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "Une clé Google Routes est requise."})
    api_key = value.strip()
    if not api_key or len(api_key) > MAX_API_KEY_LENGTH or any(ord(character) < 33 or ord(character) > 126 for character in api_key):
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "La clé Google Routes fournie est invalide."})
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(api_key)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
    now = datetime.now(UTC).replace(tzinfo=None)
    credential = _credential(session, current.user_id)
    if credential is None:
        credential = UserApiCredential(user_id=current.user_id, provider=PROVIDER, encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=api_key[-4:])
        session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext
        credential.encryption_version = encrypted.version
        credential.secret_last4 = api_key[-4:]
        credential.updated_at = now
        credential.verified_at = None
        credential.last_used_at = None
        credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.post("/verify")
def verify_credential(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    credential = _credential(session, current.user_id)
    if credential is None:
        raise HTTPException(404, {"code": "ROUTING_CREDENTIAL_NOT_CONFIGURED", "message": "Aucune clé Google Routes n’est configurée."})
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(409, {"code": error.code, "message": str(error)}) from error
    try:
        google_routing_rate_limiter.check(f"verify:{current.user_id}")
        GoogleRoutesProvider(api_key, GoogleRoutesSettings(routing_preference="TRAFFIC_UNAWARE")).calculate_route(VERIFY_COORDINATES)
    except RoutingError as error:
        credential.verified_at = None
        credential.last_error_code = error.code
        session.commit()
        status_code = 429 if error.code in {"GOOGLE_ROUTES_QUOTA_EXCEEDED", "GOOGLE_ROUTING_RATE_LIMITED"} else 503 if error.code in {"GOOGLE_ROUTES_TIMEOUT", "GOOGLE_ROUTES_PROVIDER_ERROR", "GOOGLE_ROUTES_INVALID_RESPONSE"} else 422
        raise HTTPException(status_code, {"code": error.code, "message": str(error)}) from error
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None)
    credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.delete("")
async def remove_credential(request: Request, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    payload = await _json_object(request)
    password = payload.get("current_password")
    if not isinstance(password, str) or not verify_password(current.user.password_hash, password)[0]:
        raise HTTPException(400, {"code": "CURRENT_PASSWORD_INVALID", "message": "Le mot de passe actuel est incorrect."})
    credential = _credential(session, current.user_id)
    if credential is not None:
        session.delete(credential)
    preferences = AccountPreferences.model_validate(current.user.preferences or {}).model_dump()
    provider_reset = preferences["routing"]["provider"] == "google"
    if provider_reset:
        preferences["routing"]["provider"] = "osrm"
        current.user.preferences = preferences
    session.commit()
    return {"deleted": credential is not None, "provider_reset": provider_reset, "provider": "osrm" if provider_reset else preferences["routing"]["provider"]}
