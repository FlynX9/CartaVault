from __future__ import annotations

import os
from urllib.parse import quote
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_basemap_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User, UserApiCredential
from app.database import get_db
from app.config import email_settings
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis


router = APIRouter(tags=["basemaps"])
STADIA_SATELLITE_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg"
VERIFY_URL = "https://tiles.stadiamaps.com/tiles/alidade_smooth/0/0/0.png"
STADIA_TILE_STYLES = {"alidade_smooth", "alidade_smooth_dark", "alidade_satellite"}
stadia_tiles_rate_limiter = GoogleRoutingRateLimiter(limit=1_200, redis_client=_routing_redis())


def stadia_unauthenticated_allowed() -> bool:
    environment = os.getenv("CARTAVAULT_ENVIRONMENT", os.getenv("ENVIRONMENT", "development")).strip().lower()
    hostname = urlparse(email_settings.frontend_public_url).hostname
    return environment != "production" and hostname in {"localhost", "127.0.0.1", "::1"}


def _validate_key(api_key: str) -> None:
    request = UrlRequest(f"{VERIFY_URL}?api_key={quote(api_key)}", headers={"Accept": "image/*", "User-Agent": "CartaVault/1"})
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
def basemap_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = selected_basemap_api_key(session, user, "stadia")
    key_optional = credential is None and stadia_unauthenticated_allowed()
    return {
        "personal_key_active": credential is not None,
        "key_optional": key_optional,
        "tile_path": "https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{r}.{extension}" if key_optional else "/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}?retina={r}",
    }


@router.get("/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}")
def basemap_tile(
    style: str,
    z: int,
    x: int,
    y: int,
    extension: str,
    retina: str = Query(default=""),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if style not in STADIA_TILE_STYLES or extension not in {"png", "jpg"} or retina not in {"", "@2x"}:
        raise HTTPException(404, "Tile not found")
    maximum = (1 << z) - 1 if 0 <= z <= 22 else -1
    if x < 0 or y < 0 or x > maximum or y > maximum:
        raise HTTPException(404, "Tile not found")
    credential = selected_basemap_api_key(session, user, "stadia")
    if credential is None and not stadia_unauthenticated_allowed():
        raise HTTPException(503, {"code": "STADIA_MAPS_KEY_REQUIRED", "message": "Une clé Stadia Maps est nécessaire hors développement local."})
    try:
        stadia_tiles_rate_limiter.check(f"stadia-tiles:{user.id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "STADIA_MAPS_RATE_LIMITED", "message": str(error)}) from error
    query = f"?api_key={quote(_decrypt(credential))}" if credential is not None else ""
    request = UrlRequest(
        f"https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{retina}.{extension}{query}",
        headers={"Accept": "image/*", "User-Agent": "CartaVault/1"},
    )
    try:
        with urlopen(request, timeout=10) as upstream:
            content = upstream.read(8 * 1024 * 1024)
            content_type = upstream.headers.get_content_type()
    except HTTPError as error:
        raise HTTPException(502, {"code": "STADIA_MAPS_UPSTREAM_ERROR", "message": "Stadia Maps est momentanément indisponible.", "provider_status": error.code}) from error
    except (TimeoutError, URLError, OSError) as error:
        raise HTTPException(503, {"code": "STADIA_MAPS_UNAVAILABLE", "message": "Stadia Maps est momentanément indisponible."}) from error
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
