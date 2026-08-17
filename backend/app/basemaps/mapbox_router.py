from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.auth.api_keys import decrypt_api_key, mark_api_key_error, mark_api_key_used, selected_basemap_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.database import get_db
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis


router = APIRouter(prefix="/basemaps/mapbox-satellite", tags=["basemaps"])
MAPBOX_TILE_URL = "https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90"
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
    return {"available": selected_basemap_api_key(session, user, "mapbox") is not None}


@router.get("/tiles/{z}/{x}/{y}")
def tile(z: int, x: int, y: int, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    maximum = (1 << z) - 1 if 0 <= z <= 22 else -1
    if x < 0 or y < 0 or x > maximum or y > maximum:
        raise HTTPException(404, "Tile not found")
    credential = selected_basemap_api_key(session, user, "mapbox")
    if credential is None:
        raise HTTPException(503, {"code": "MAPBOX_NOT_CONFIGURED", "message": "Le fond Mapbox Satellite n’est pas configuré."})
    try:
        mapbox_tiles_rate_limiter.check(f"mapbox-tiles:{user.id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "MAPBOX_RATE_LIMITED", "message": str(error)}) from error
    try:
        with urlopen(_mapbox_request(decrypt_api_key(credential), z, x, y), timeout=10) as upstream:
            content = upstream.read(8 * 1024 * 1024)
            content_type = upstream.headers.get_content_type()
    except HTTPError as error:
        mark_api_key_error(session, credential, "MAPBOX_UPSTREAM_ERROR")
        raise HTTPException(502, {"code": "MAPBOX_UPSTREAM_ERROR", "message": "Mapbox est momentanément indisponible.", "provider_status": error.code}) from error
    except (TimeoutError, URLError, OSError) as error:
        mark_api_key_error(session, credential, "MAPBOX_UNAVAILABLE")
        raise HTTPException(503, {"code": "MAPBOX_UNAVAILABLE", "message": "Mapbox est momentanément indisponible."}) from error
    mark_api_key_used(session, credential)
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
