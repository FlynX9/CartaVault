from __future__ import annotations

from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User, UserApiCredential
from app.database import get_db


router = APIRouter(tags=["basemaps"])
STADIA_SATELLITE_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg"
VERIFY_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/0/0/0.jpg"


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


def _decrypt(credential: UserApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(409, {"code": error.code, "message": str(error)}) from error


@router.get("/basemaps/stadia/config")
def basemap_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> JSONResponse:
    credential = selected_api_key(session, user, "basemaps", "stadia")
    tile_url = None
    if credential is not None:
        tile_url = f"{STADIA_SATELLITE_URL}?api_key={quote(_decrypt(credential))}"
    return JSONResponse({"personal_key_active": tile_url is not None, "tile_url": tile_url}, headers={"Cache-Control": "no-store"})
