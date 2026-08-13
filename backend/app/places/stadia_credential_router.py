from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import mark_api_key_used, selected_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User, UserApiCredential
from app.database import get_db


router = APIRouter(tags=["places"])
VERIFY_URL = "https://api-eu.stadiamaps.com/geocoding/v1/search"


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


def _decrypt(credential: UserApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(409, {"code": error.code, "message": str(error)}) from error


@router.get("/account/integrations/stadia-places/config")
def search_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> JSONResponse:
    credential = selected_api_key(session, user, "places", "stadia")
    api_key = _decrypt(credential) if credential is not None else None
    if credential is not None and api_key is not None:
        mark_api_key_used(session, credential)
    return JSONResponse({"personal_key_active": api_key is not None, "api_key": api_key}, headers={"Cache-Control": "no-store"})
