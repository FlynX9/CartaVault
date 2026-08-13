from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import mark_api_key_used, selected_api_key
from app.auth.dependencies import get_current_session
from app.auth.models import UserSession
from app.auth.schemas import AccountPreferences
from app.database import get_db
from app.places.google_places import GooglePlacesError, search_google_places
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import google_routing_rate_limiter


router = APIRouter(prefix="/account/integrations/google-places", tags=["account"])


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=500), country_code: str | None = Query(default=None, min_length=2, max_length=2), limit: int = Query(default=8, ge=1, le=20), session: Session = Depends(get_db), current: UserSession = Depends(get_current_session)) -> dict[str, object]:
    preferences = AccountPreferences.model_validate(current.user.preferences or {})
    credential = selected_api_key(session, current.user, "places", "google")
    if preferences.places.provider != "google" or credential is None:
        return {"items": [], "available": False, "warning_code": "GOOGLE_PLACES_NOT_SELECTED" if preferences.places.provider != "google" else "GOOGLE_PLACES_CREDENTIAL_UNAVAILABLE"}
    try:
        api_key = CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
        google_routing_rate_limiter.check(f"places:{current.user_id}")
        items = search_google_places(api_key, q.strip(), country_code, limit)
    except (CredentialEncryptionError, GooglePlacesError, RoutingError) as error:
        code = getattr(error, "code", "GOOGLE_PLACES_UNAVAILABLE")
        raise HTTPException(429 if code in {"GOOGLE_PLACES_QUOTA_EXCEEDED", "GOOGLE_ROUTING_RATE_LIMITED"} else 503, {"code": code, "message": str(error)}) from error
    mark_api_key_used(session, credential)
    return {"items": [{"id": item.id, "name": item.name, "formattedAddress": item.formatted_address, "latitude": item.latitude, "longitude": item.longitude, "countryCode": item.country_code, "locality": item.locality, "postalCode": item.postal_code, "source": "google_places", "confidence": 1} for item in items], "available": True, "warning_code": None}
