from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.config import arcgis_basemap_settings


router = APIRouter(prefix="/basemaps/arcgis-satellite", tags=["basemaps"])
_ALLOWED_TILE_HOST_SUFFIXES = (".arcgis.com", ".arcgisonline.com")


def _provider_json(path: str, bearer: str) -> dict[str, Any]:
    request = UrlRequest(
        f"{arcgis_basemap_settings.base_url}{path}",
        headers={"Accept": "application/json", "Authorization": f"Bearer {bearer}", "User-Agent": "CartaVault/1"},
    )
    try:
        with urlopen(request, timeout=arcgis_basemap_settings.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        code = "ARCGIS_CREDENTIAL_INVALID" if error.code in {400, 401, 403} else "ARCGIS_UNAVAILABLE"
        message = "La clé ArcGIS de l’instance a été refusée." if code == "ARCGIS_CREDENTIAL_INVALID" else "ArcGIS est momentanément indisponible."
        raise HTTPException(503, {"code": code, "message": message}) from error
    except (TimeoutError, URLError, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(503, {"code": "ARCGIS_UNAVAILABLE", "message": "ArcGIS est momentanément indisponible."}) from error
    if not isinstance(payload, dict) or isinstance(payload.get("error"), dict):
        raise HTTPException(502, {"code": "ARCGIS_RESPONSE_INVALID", "message": "ArcGIS a renvoyé une configuration invalide."})
    return payload


def _find_imagery_service_url(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("url", "serviceUrl", "styleUrl"):
            candidate = value.get(key)
            if isinstance(candidate, str) and "World_Imagery" in candidate:
                parsed = urlparse(candidate)
                host = (parsed.hostname or "").lower()
                if parsed.scheme == "https" and any(host.endswith(suffix) for suffix in _ALLOWED_TILE_HOST_SUFFIXES):
                    return candidate.rstrip("/")
        for nested in value.values():
            found = _find_imagery_service_url(nested)
            if found:
                return found
    elif isinstance(value, list):
        for nested in value:
            found = _find_imagery_service_url(nested)
            if found:
                return found
    return None


@router.post("/session")
def create_arcgis_session(
    response: Response,
    _user: User = Depends(get_current_user),
) -> dict[str, object]:
    long_lived_key = arcgis_basemap_settings.api_key
    if not long_lived_key:
        raise HTTPException(503, {"code": "ARCGIS_NOT_CONFIGURED", "message": "Le fond ArcGIS Satellite n’est pas configuré sur cette instance."})

    session = _provider_json(
        f"/sessions/start?styleFamily=arcgis&durationSeconds={arcgis_basemap_settings.session_duration_seconds}",
        long_lived_key,
    )
    short_token = session.get("sessionToken")
    end_time = session.get("endTime")
    if not isinstance(short_token, str) or not short_token or not isinstance(end_time, (int, float)):
        raise HTTPException(502, {"code": "ARCGIS_RESPONSE_INVALID", "message": "ArcGIS n’a pas créé de session cartographique valide."})

    webmap = _provider_json("/webmaps/arcgis/imagery", short_token)
    service_url = _find_imagery_service_url(webmap)
    if service_url is None:
        raise HTTPException(502, {"code": "ARCGIS_RESPONSE_INVALID", "message": "Le service ArcGIS World Imagery est introuvable."})

    response.headers["Cache-Control"] = "private, no-store"
    separator = "&" if "?" in service_url else "?"
    return {
        "tile_url": f"{service_url}/tile/{{z}}/{{y}}/{{x}}{separator}token={quote(short_token, safe='')}",
        "expires": datetime.fromtimestamp(float(end_time) / 1000, UTC).isoformat(),
        "attribution": "Tiles © Esri",
        "max_zoom": 23,
    }
