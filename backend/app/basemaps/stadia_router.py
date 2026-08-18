from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_basemap_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import AdminApiCredential, User, UserApiCredential
from app.auth.provider_sessions import (
    BasemapTileSession,
    ProviderSessionError,
    decode_basemap_tile_session,
    encode_basemap_tile_session,
)
from app.database import get_db
from app.config import email_settings, security_settings
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis
from app.basemaps.http_client import BasemapUpstreamStatusError, BasemapUpstreamUnavailable, fetch_basemap_tile


router = APIRouter(tags=["basemaps"])
STADIA_SATELLITE_URL = "https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg"
VERIFY_URL = "https://tiles.stadiamaps.com/tiles/alidade_smooth/0/0/0.png"
STADIA_TILE_STYLES = {"alidade_smooth", "alidade_smooth_dark", "alidade_satellite"}
STADIA_TILE_SESSION_COOKIE = "cartavault_stadia_tiles_session"
STADIA_TILE_SESSION_LIFETIME = timedelta(minutes=15)
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


def _decrypt(credential: UserApiCredential | AdminApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(409, {"code": error.code, "message": str(error)}) from error


@router.get("/basemaps/stadia/config")
def basemap_config(
    response: Response,
    capability: Literal["classic_basemap", "satellite_basemap"] = Query(default="classic_basemap"),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    credential = selected_basemap_api_key(session, user, "stadia", capability)
    key_optional = credential is None and stadia_unauthenticated_allowed()
    expires_at: datetime | None = None
    if credential is not None:
        expires_at = datetime.now(UTC) + STADIA_TILE_SESSION_LIFETIME
        token = encode_basemap_tile_session(BasemapTileSession(
            provider="stadia",
            user_id=user.id,
            credential_id=credential.id,
            api_key=_decrypt(credential),
            capability=capability,
            expires_at=expires_at,
        ))
        response.set_cookie(
            STADIA_TILE_SESSION_COOKIE,
            token,
            max_age=int(STADIA_TILE_SESSION_LIFETIME.total_seconds()),
            httponly=True,
            secure=security_settings.cookie_secure,
            samesite="lax",
            path="/",
        )
        response.headers["Cache-Control"] = "private, no-store"
    return {
        "personal_key_active": credential is not None,
        "key_optional": key_optional,
        "tile_path": "https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{r}.{extension}" if key_optional else "/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}?retina={r}",
        "expires": expires_at.isoformat() if expires_at is not None else None,
    }


@router.get("/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}")
async def basemap_tile(
    style: str,
    z: int,
    x: int,
    y: int,
    extension: str,
    request: Request,
    retina: str = Query(default=""),
) -> Response:
    if style not in STADIA_TILE_STYLES or extension not in {"png", "jpg"} or retina not in {"", "@2x"}:
        raise HTTPException(404, "Tile not found")
    maximum = (1 << z) - 1 if 0 <= z <= 22 else -1
    if x < 0 or y < 0 or x > maximum or y > maximum:
        raise HTTPException(404, "Tile not found")
    capability = "satellite_basemap" if style == "alidade_satellite" else "classic_basemap"
    token = request.cookies.get(STADIA_TILE_SESSION_COOKIE)
    if not token:
        raise HTTPException(401, {"code": "STADIA_TILE_SESSION_REQUIRED", "message": "La session cartographique Stadia a expiré."})
    try:
        tile_session = decode_basemap_tile_session(token, provider="stadia")
    except ProviderSessionError as error:
        raise HTTPException(401, {"code": "STADIA_TILE_SESSION_INVALID", "message": "La session cartographique Stadia a expiré."}) from error
    if tile_session.capability != capability:
        raise HTTPException(403, {"code": "STADIA_TILE_SESSION_FORBIDDEN", "message": "Cette session Stadia ne permet pas ce fond de carte."})
    try:
        stadia_tiles_rate_limiter.check(f"stadia-tiles:{tile_session.user_id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "STADIA_MAPS_RATE_LIMITED", "message": str(error)}) from error
    query = f"?api_key={quote(tile_session.api_key)}"
    tile_url = f"https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{retina}.{extension}{query}"
    try:
        content, content_type = await fetch_basemap_tile(
            tile_url,
            headers={"Accept": "image/*", "User-Agent": "CartaVault/1"},
            timeout=10,
        )
    except BasemapUpstreamStatusError as error:
        raise HTTPException(502, {"code": "STADIA_MAPS_UPSTREAM_ERROR", "message": "Stadia Maps est momentanément indisponible.", "provider_status": error.status_code}) from error
    except BasemapUpstreamUnavailable as error:
        raise HTTPException(503, {"code": "STADIA_MAPS_UNAVAILABLE", "message": "Stadia Maps est momentanément indisponible."}) from error
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
