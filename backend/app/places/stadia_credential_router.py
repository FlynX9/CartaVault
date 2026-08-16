from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request as UrlRequest, urlopen

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import mark_api_key_used, selected_api_key
from app.auth.dependencies import get_current_user
from app.auth.models import User, UserApiCredential
from app.database import get_db
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis


router = APIRouter(tags=["places"])
VERIFY_URL = "https://api-eu.stadiamaps.com/geocoding/v1/search"
stadia_places_rate_limiter = GoogleRoutingRateLimiter(limit=120, redis_client=_routing_redis())


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
def search_config(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    credential = selected_api_key(session, user, "places", "stadia")
    return {"personal_key_active": credential is not None}


def _proxy(path: str, parameters: dict[str, str | int | float | None], session: Session, user: User) -> dict[str, object]:
    credential = selected_api_key(session, user, "places", "stadia")
    if credential is None:
        raise HTTPException(503, {"code": "STADIA_PLACES_CREDENTIAL_UNAVAILABLE", "message": "Aucune clé Stadia Places n’est configurée."})
    try:
        stadia_places_rate_limiter.check(f"stadia-places:{user.id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "STADIA_PLACES_RATE_LIMITED", "message": str(error)}) from error
    query = urlencode({**{key: value for key, value in parameters.items() if value is not None}, "api_key": _decrypt(credential)}, quote_via=quote)
    request = UrlRequest(f"{VERIFY_URL.rsplit('/search', 1)[0]}/{path}?{query}", headers={"Accept": "application/json", "User-Agent": "CartaVault/1"})
    try:
        with urlopen(request, timeout=10) as upstream:
            payload = json.loads(upstream.read(2 * 1024 * 1024))
    except HTTPError as error:
        code = "STADIA_PLACES_AUTH" if error.code in {401, 403} else "STADIA_PLACES_UNAVAILABLE"
        raise HTTPException(503, {"code": code, "message": "La recherche Stadia est momentanément indisponible.", "provider_status": error.code}) from error
    except (TimeoutError, URLError, OSError, json.JSONDecodeError) as error:
        raise HTTPException(503, {"code": "STADIA_PLACES_UNAVAILABLE", "message": "La recherche Stadia est momentanément indisponible."}) from error
    features = payload.get("features") if isinstance(payload, dict) else None
    if not isinstance(features, list):
        raise HTTPException(502, {"code": "STADIA_PLACES_INVALID_RESPONSE", "message": "Stadia Places a renvoyé une réponse invalide."})
    mark_api_key_used(session, credential)
    return {"features": features[:20]}


@router.get("/account/integrations/stadia-places/search")
def search(
    q: str = Query(min_length=2, max_length=500),
    country_code: str | None = Query(default=None, min_length=2, max_length=2),
    limit: int = Query(default=6, ge=1, le=20),
    focus_lat: float | None = Query(default=None, ge=-90, le=90),
    focus_lon: float | None = Query(default=None, ge=-180, le=180),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    return _proxy("search", {"text": q, "size": limit, "boundary.country": country_code, "focus.point.lat": focus_lat, "focus.point.lon": focus_lon}, session, user)


@router.get("/account/integrations/stadia-places/reverse")
def reverse(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    limit: int = Query(default=1, ge=1, le=20),
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    return _proxy("reverse", {"point.lat": latitude, "point.lon": longitude, "size": limit}, session, user)
