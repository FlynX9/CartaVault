from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.api_keys import selected_google_maps_javascript_key
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import AdminApiCredential, User, UserApiCredential
from app.database import get_db


router = APIRouter(prefix="/basemaps/google-satellite", tags=["basemaps"])
admin_router = APIRouter(
    prefix="/admin/console/google-satellite",
    tags=["admin-console"],
    dependencies=[Depends(require_admin)],
)
SETTING_KEY = "google_satellite"
DEFAULTS: dict[str, object] = {"maps_javascript_enabled": True}


class SatelliteSettingsUpdate(BaseModel):
    maps_javascript_enabled: bool = True


class GoogleMapsJavaScriptLoaded(BaseModel):
    map_type: Literal["satellite"] = "satellite"


def _setting(session: Session) -> tuple[SystemSetting | None, dict[str, object]]:
    row = session.get(SystemSetting, SETTING_KEY)
    return row, {**DEFAULTS, **(row.value if row else {})}


def _save_setting(session: Session, values: dict[str, object]) -> None:
    normalized = {"maps_javascript_enabled": bool(values.get("maps_javascript_enabled", True))}
    row = session.get(SystemSetting, SETTING_KEY)
    if row is None:
        session.add(SystemSetting(key=SETTING_KEY, value=normalized))
    else:
        row.value = normalized


def _admin_status(session: Session) -> dict[str, object]:
    _, values = _setting(session)
    enabled = bool(values["maps_javascript_enabled"])
    return {
        "available": enabled,
        "settings": {"maps_javascript_enabled": enabled},
        "integration": "google_maps_javascript",
        "traffic": "browser_to_google",
    }


def _api_key(credential: UserApiCredential | AdminApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(
            credential.encrypted_secret,
            credential.encryption_version,
        )
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


@router.get("/maps-js/config")
def google_maps_javascript_config(
    response: Response,
    map_type: Literal["satellite"] = "satellite",
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, object]:
    credential = selected_google_maps_javascript_key(session, user, "satellite_basemap")
    _, values = _setting(session)
    if not values.get("maps_javascript_enabled") or credential is None:
        raise HTTPException(
            503,
            {
                "code": "GOOGLE_MAPS_JS_UNAVAILABLE",
                "message": "Le fond Google Satellite nécessite une clé navigateur autorisant Maps JavaScript API.",
            },
        )
    response.headers["Cache-Control"] = "private, no-store"
    language = str((user.preferences or {}).get("language", "fr"))
    return {
        "api_key": _api_key(credential),
        "language": "en" if language.lower().startswith("en") else "fr",
        "region": "",
        "map_type": map_type,
    }


@router.post("/maps-js/loaded")
def google_maps_javascript_loaded(
    data: GoogleMapsJavaScriptLoaded,
    session: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    credential = selected_google_maps_javascript_key(session, user, "satellite_basemap")
    if credential is None:
        raise HTTPException(
            404,
            {
                "code": "GOOGLE_MAPS_JS_CREDENTIAL_NOT_FOUND",
                "message": "Clé Google Maps JavaScript introuvable.",
            },
        )
    now = datetime.now(UTC).replace(tzinfo=None)
    credential.verified_at = credential.verified_at or now
    credential.last_used_at = now
    credential.last_error_code = None
    credential.last_error_status = None
    credential.last_error_message = None
    credential.last_error_at = None
    session.commit()
    return {"loaded": True}


@admin_router.get("")
def admin_status(session: Session = Depends(get_db)) -> dict[str, object]:
    return _admin_status(session)


@admin_router.put("/settings")
def update_settings(
    payload: SatelliteSettingsUpdate,
    session: Session = Depends(get_db),
) -> dict[str, object]:
    _save_setting(session, payload.model_dump())
    session.commit()
    return _admin_status(session)
