from __future__ import annotations

from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User, UserApiCredential
from app.auth.security import verify_password
from app.database import get_db


router = APIRouter(tags=["places"])
PROVIDER = "stadia_places"
VERIFY_URL = "https://api-eu.stadiamaps.com/geocoding/v1/search"


def _credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == PROVIDER))


def _status(credential: UserApiCredential | None) -> dict[str, object]:
    return {
        "configured": credential is not None,
        "last4": credential.secret_last4 if credential else None,
        "verified": bool(credential and credential.verified_at),
        "verified_at": credential.verified_at if credential else None,
        "last_used_at": credential.last_used_at if credential else None,
        "last_error_code": credential.last_error_code if credential else None,
    }


def _decrypt(credential: UserApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(409, {"code": error.code, "message": str(error)}) from error


async def _json_object(request: Request) -> dict[str, object]:
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."}) from error
    if not isinstance(payload, dict):
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."})
    return payload


def _validate_key(api_key: str) -> None:
    query = urlencode({"text": "Paris", "size": 1, "api_key": api_key}, quote_via=quote)
    request = UrlRequest(f"{VERIFY_URL}?{query}", headers={"User-Agent": "CartaVault/1"})
    try:
        with urlopen(request, timeout=10) as response:
            if int(getattr(response, "status", 200)) >= 400:
                raise HTTPException(422, {"code": "STADIA_PLACES_KEY_INVALID", "message": "La clé Stadia Places a été refusée."})
    except HTTPError as error:
        status = 422 if error.code in {400, 401, 403} else 503
        code = "STADIA_PLACES_KEY_INVALID" if status == 422 else "STADIA_PLACES_UNAVAILABLE"
        message = "La clé Stadia Places a été refusée." if status == 422 else "La recherche Stadia est momentanément indisponible."
        raise HTTPException(status, {"code": code, "message": message}) from error
    except (TimeoutError, URLError) as error:
        raise HTTPException(503, {"code": "STADIA_PLACES_UNAVAILABLE", "message": "La recherche Stadia est momentanément indisponible."}) from error


@router.get("/account/integrations/stadia-places")
def credential_status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    return _status(_credential(session, user.id))


@router.put("/account/integrations/stadia-places")
async def store_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    value = (await _json_object(request)).get("api_key")
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 512:
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "Une clé Stadia Places valide est requise."})
    api_key = value.strip()
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(api_key)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
    credential = _credential(session, user.id)
    if credential is None:
        credential = UserApiCredential(user_id=user.id, provider=PROVIDER, encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=api_key[-4:])
        session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext
        credential.encryption_version = encrypted.version
        credential.secret_last4 = api_key[-4:]
        credential.verified_at = None
        credential.last_used_at = None
        credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.post("/account/integrations/stadia-places/verify")
def verify_credential(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = _credential(session, user.id)
    if credential is None:
        raise HTTPException(404, {"code": "STADIA_PLACES_KEY_NOT_CONFIGURED", "message": "Aucune clé Stadia Places n’est configurée."})
    try:
        _validate_key(_decrypt(credential))
    except HTTPException as error:
        credential.verified_at = None
        credential.last_error_code = str(error.detail.get("code")) if isinstance(error.detail, dict) else "STADIA_PLACES_KEY_INVALID"
        session.commit()
        raise
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None)
    credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.delete("/account/integrations/stadia-places")
async def delete_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    password = (await _json_object(request)).get("current_password")
    if not isinstance(password, str) or not verify_password(user.password_hash, password)[0]:
        raise HTTPException(400, {"code": "CURRENT_PASSWORD_INVALID", "message": "Le mot de passe actuel est incorrect."})
    credential = _credential(session, user.id)
    if credential is not None:
        session.delete(credential)
    session.commit()
    return {"deleted": credential is not None}


@router.get("/account/integrations/stadia-places/config")
def search_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> JSONResponse:
    credential = selected_api_key(session, user, "places", "stadia")
    api_key = _decrypt(credential) if credential is not None else None
    if credential is not None and api_key is not None:
        credential.last_used_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()
    return JSONResponse({"personal_key_active": api_key is not None, "api_key": api_key}, headers={"Cache-Control": "no-store"})
