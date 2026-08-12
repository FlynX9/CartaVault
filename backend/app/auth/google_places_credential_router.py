from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_api_key
from app.auth.dependencies import get_current_session
from app.auth.models import UserApiCredential, UserSession
from app.auth.schemas import AccountPreferences
from app.auth.security import verify_password
from app.database import get_db
from app.places.google_places import GooglePlacesError, search_google_places
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import google_routing_rate_limiter


router = APIRouter(prefix="/account/integrations/google-places", tags=["account"])
PROVIDER = "google_places"


def _credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == PROVIDER))


def _status(credential: UserApiCredential | None) -> dict[str, object]:
    return {"configured": credential is not None, "last4": credential.secret_last4 if credential else None,
            "verified": credential is not None and credential.verified_at is not None,
            "verified_at": credential.verified_at if credential else None, "last_used_at": credential.last_used_at if credential else None,
            "last_error_code": credential.last_error_code if credential else None}


async def _payload(request: Request) -> dict[str, object]:
    try:
        value = await request.json()
    except Exception as error:
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."}) from error
    if not isinstance(value, dict):
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."})
    return value


@router.get("")
def status(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    return _status(_credential(session, current.user_id))


@router.put("")
async def store(request: Request, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    value = (await _payload(request)).get("api_key")
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 512:
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "Une clé Google Places est requise."})
    api_key = value.strip()
    encrypted = CredentialEncryptionService.from_settings().encrypt(api_key)
    credential = _credential(session, current.user_id)
    if credential is None:
        credential = UserApiCredential(user_id=current.user_id, provider=PROVIDER, encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=api_key[-4:])
        session.add(credential)
    else:
        credential.encrypted_secret, credential.encryption_version, credential.secret_last4 = encrypted.ciphertext, encrypted.version, api_key[-4:]
        credential.verified_at = credential.last_used_at = None
        credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.post("/verify")
def verify(session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    credential = _credential(session, current.user_id)
    if credential is None:
        raise HTTPException(404, {"code": "GOOGLE_PLACES_CREDENTIAL_NOT_CONFIGURED", "message": "Aucune clé Google Places n’est configurée."})
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
        google_routing_rate_limiter.check(f"places-verify:{current.user_id}")
        search_google_places(api_key, "Paris", "FR", 1)
    except (CredentialEncryptionError, GooglePlacesError, RoutingError) as error:
        code = getattr(error, "code", "GOOGLE_PLACES_UNAVAILABLE")
        credential.verified_at = None; credential.last_error_code = code; session.commit()
        raise HTTPException(422, {"code": code, "message": str(error)}) from error
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None); credential.last_error_code = None; session.commit()
    return _status(credential)


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=500), country_code: str | None = Query(default=None, min_length=2, max_length=2), limit: int = Query(default=8, ge=1, le=20), session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    preferences = AccountPreferences.model_validate(current.user.preferences or {})
    credential = selected_api_key(session, current.user, "places", "google")
    if preferences.places.provider != "google" or credential is None:
        return {"items": [], "available": False, "warning_code": "GOOGLE_PLACES_NOT_SELECTED" if preferences.places.provider != "google" else "GOOGLE_PLACES_CREDENTIAL_UNAVAILABLE"}
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
        google_routing_rate_limiter.check(f"places:{current.user_id}")
        items = search_google_places(api_key, q.strip(), country_code, limit)
    except (CredentialEncryptionError, GooglePlacesError, RoutingError) as error:
        code = getattr(error, "code", "GOOGLE_PLACES_UNAVAILABLE")
        raise HTTPException(429 if code in {"GOOGLE_PLACES_QUOTA_EXCEEDED", "GOOGLE_ROUTING_RATE_LIMITED"} else 503, {"code": code, "message": str(error)}) from error
    credential.last_used_at = datetime.now(UTC).replace(tzinfo=None); credential.last_error_code = None; session.commit()
    return {"items": [{"id": item.id, "name": item.name, "formattedAddress": item.formatted_address, "latitude": item.latitude, "longitude": item.longitude, "countryCode": item.country_code, "locality": item.locality, "postalCode": item.postal_code, "source": "google_places", "confidence": 1} for item in items], "available": True, "warning_code": None}


@router.delete("")
async def remove(request: Request, session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    password = (await _payload(request)).get("current_password")
    if not isinstance(password, str) or not verify_password(current.user.password_hash, password)[0]:
        raise HTTPException(400, {"code": "CURRENT_PASSWORD_INVALID", "message": "Le mot de passe actuel est incorrect."})
    credential = _credential(session, current.user_id)
    if credential is not None: session.delete(credential)
    preferences = AccountPreferences.model_validate(current.user.preferences or {})
    provider_reset = preferences.places.provider == "google"
    if provider_reset:
        preferences.places.provider = "stadia"; current.user.preferences = preferences.model_dump()
    session.commit()
    return {"deleted": credential is not None, "provider_reset": provider_reset, "provider": "stadia"}
