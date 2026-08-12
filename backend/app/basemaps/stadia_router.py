from __future__ import annotations

from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
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


router = APIRouter(tags=["basemaps"])
PROVIDER = "stadia_maps"
STADIA_SATELLITE_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg"
VERIFY_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/0/0/0.jpg"


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
    request = UrlRequest(f"{VERIFY_URL}?api_key={quote(api_key)}", headers={"User-Agent": "CartaVault/1"})
    try:
        with urlopen(request, timeout=10) as response:
            if int(getattr(response, "status", 200)) >= 400:
                raise HTTPException(422, {"code": "STADIA_MAPS_KEY_INVALID", "message": "La clé Stadia Maps a été refusée."})
    except HTTPError as error:
        status = 422 if error.code in {400, 401, 403} else 503
        raise HTTPException(status, {"code": "STADIA_MAPS_KEY_INVALID" if status == 422 else "STADIA_MAPS_UNAVAILABLE", "message": "La clé Stadia Maps a été refusée." if status == 422 else "Stadia Maps est momentanément indisponible.", "provider_status": error.code}) from error
    except (TimeoutError, URLError) as error:
        raise HTTPException(503, {"code": "STADIA_MAPS_UNAVAILABLE", "message": "Stadia Maps est momentanément indisponible."}) from error


@router.get("/account/integrations/stadia-maps")
def credential_status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    return _status(_credential(session, user.id))


@router.put("/account/integrations/stadia-maps")
async def store_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    value = (await _json_object(request)).get("api_key")
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 512:
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "Une clé Stadia Maps valide est requise."})
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


@router.post("/account/integrations/stadia-maps/verify")
def verify_credential(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = _credential(session, user.id)
    if credential is None:
        raise HTTPException(404, {"code": "STADIA_MAPS_KEY_NOT_CONFIGURED", "message": "Aucune clé Stadia Maps n’est configurée."})
    try:
        _validate_key(_decrypt(credential))
    except HTTPException as error:
        credential.verified_at = None
        credential.last_error_code = str(error.detail.get("code")) if isinstance(error.detail, dict) else "STADIA_MAPS_KEY_INVALID"
        session.commit()
        raise
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None)
    credential.last_error_code = None
    session.commit()
    return _status(credential)


@router.delete("/account/integrations/stadia-maps")
async def delete_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    password = (await _json_object(request)).get("current_password")
    if not isinstance(password, str) or not verify_password(user.password_hash, password)[0]:
        raise HTTPException(400, {"code": "CURRENT_PASSWORD_INVALID", "message": "Le mot de passe actuel est incorrect."})
    credential = _credential(session, user.id)
    if credential is not None:
        session.delete(credential)
    session.commit()
    return {"deleted": credential is not None}


@router.get("/basemaps/stadia/config")
def basemap_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> JSONResponse:
    credential = selected_api_key(session, user, "basemaps", "stadia")
    tile_url = None
    if credential is not None:
        tile_url = f"{STADIA_SATELLITE_URL}?api_key={quote(_decrypt(credential))}"
    return JSONResponse({"personal_key_active": tile_url is not None, "tile_url": tile_url}, headers={"Cache-Control": "no-store"})
