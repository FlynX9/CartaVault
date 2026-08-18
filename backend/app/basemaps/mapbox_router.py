from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth.api_keys import decrypt_api_key, mark_api_key_used, selected_basemap_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.provider_sessions import (
    BasemapTileSession,
    ProviderSessionError,
    decode_basemap_tile_session,
    encode_basemap_tile_session,
)
from app.config import security_settings
from app.database import get_db
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis
from app.basemaps.http_client import BasemapUpstreamStatusError, BasemapUpstreamUnavailable, fetch_basemap_tile


router = APIRouter(prefix="/basemaps/mapbox-satellite", tags=["basemaps"])
MAPBOX_TILE_URL = "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90"
MAPBOX_TILE_SESSION_COOKIE = "cartavault_mapbox_tiles_session"
MAPBOX_TILE_SESSION_LIFETIME = timedelta(minutes=15)
mapbox_tiles_rate_limiter = GoogleRoutingRateLimiter(limit=1_200, redis_client=_routing_redis())


def _mapbox_request(token: str, z: int, x: int, y: int) -> UrlRequest:
    return UrlRequest(
        f"{MAPBOX_TILE_URL.format(z=z, x=x, y=y)}?access_token={quote(token, safe='')}",
        headers={"Accept": "image/*", "User-Agent": "CartaVault/1"},
    )


def validate_mapbox_key(token: str) -> None:
    try:
        with urlopen(_mapbox_request(token, 0, 0, 0), timeout=10) as response:
            if int(getattr(response, "status", 200)) >= 400:
                raise HTTPException(422, {"code": "MAPBOX_KEY_INVALID", "message": "Le jeton Mapbox a été refusé."})
    except HTTPError as error:
        status = 422 if error.code in {400, 401, 403} else 503
        raise HTTPException(status, {"code": "MAPBOX_KEY_INVALID" if status == 422 else "MAPBOX_UNAVAILABLE", "message": "Le jeton Mapbox a été refusé." if status == 422 else "Mapbox est momentanément indisponible.", "provider_status": error.code}) from error
    except (TimeoutError, URLError, OSError) as error:
        raise HTTPException(503, {"code": "MAPBOX_UNAVAILABLE", "message": "Mapbox est momentanément indisponible."}) from error


@router.get("/status")
def status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    return {"available": selected_basemap_api_key(session, user, "mapbox", "satellite_basemap") is not None}


@router.post("/session")
def create_tile_session(
    response: Response,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    credential = selected_basemap_api_key(session, user, "mapbox", "satellite_basemap")
    if credential is None:
        raise HTTPException(503, {"code": "MAPBOX_NOT_CONFIGURED", "message": "Le fond Mapbox Satellite n’est pas configuré."})
    expires_at = datetime.now(UTC) + MAPBOX_TILE_SESSION_LIFETIME
    token = encode_basemap_tile_session(BasemapTileSession(
        provider="mapbox",
        user_id=user.id,
        credential_id=credential.id,
        api_key=decrypt_api_key(credential),
        capability="satellite_basemap",
        expires_at=expires_at,
    ))
    mark_api_key_used(session, credential)
    response.set_cookie(
        MAPBOX_TILE_SESSION_COOKIE,
        token,
        max_age=int(MAPBOX_TILE_SESSION_LIFETIME.total_seconds()),
        httponly=True,
        secure=security_settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "private, no-store"
    return {
        "tile_path": "/basemaps/mapbox-satellite/tiles/{z}/{x}/{y}",
        "expires": expires_at.isoformat(),
        "attribution": "© Mapbox © OpenStreetMap",
        "max_zoom": 22,
    }


@router.get("/tiles/{z}/{x}/{y}")
async def tile(z: int, x: int, y: int, request: Request) -> Response:
    maximum = (1 << z) - 1 if 0 <= z <= 22 else -1
    if x < 0 or y < 0 or x > maximum or y > maximum:
        raise HTTPException(404, "Tile not found")
    token = request.cookies.get(MAPBOX_TILE_SESSION_COOKIE)
    if not token:
        raise HTTPException(401, {"code": "MAPBOX_TILE_SESSION_REQUIRED", "message": "La session cartographique Mapbox a expiré."})
    try:
        tile_session = decode_basemap_tile_session(token, provider="mapbox")
    except ProviderSessionError as error:
        raise HTTPException(401, {"code": "MAPBOX_TILE_SESSION_INVALID", "message": "La session cartographique Mapbox a expiré."}) from error
    try:
        mapbox_tiles_rate_limiter.check(f"mapbox-tiles:{tile_session.user_id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "MAPBOX_RATE_LIMITED", "message": str(error)}) from error
    tile_url = _mapbox_request(tile_session.api_key, z, x, y).full_url
    try:
        content, content_type = await fetch_basemap_tile(
            tile_url,
            headers={"Accept": "image/*", "User-Agent": "CartaVault/1"},
            timeout=10,
        )
    except BasemapUpstreamStatusError as error:
        raise HTTPException(502, {"code": "MAPBOX_UPSTREAM_ERROR", "message": "Mapbox est momentanément indisponible.", "provider_status": error.status_code}) from error
    except BasemapUpstreamUnavailable as error:
        raise HTTPException(503, {"code": "MAPBOX_UNAVAILABLE", "message": "Mapbox est momentanément indisponible."}) from error
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
