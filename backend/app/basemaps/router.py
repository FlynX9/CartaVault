from __future__ import annotations

import json
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import SystemCredential, User
from app.basemaps.models import GoogleSatelliteUsageDaily
from app.config import email_settings, google_map_tiles_settings
from app.database import get_db


router = APIRouter(prefix="/basemaps/google-satellite", tags=["basemaps"])
admin_router = APIRouter(prefix="/admin/console/google-satellite", tags=["admin-console"], dependencies=[Depends(require_admin)])
PROVIDER = "google_map_tiles"
SETTING_KEY = "google_satellite"
DEFAULTS: dict[str, object] = {
    "enabled": False,
    "daily_soft_limit": google_map_tiles_settings.daily_soft_limit,
    "monthly_soft_limit": google_map_tiles_settings.monthly_soft_limit,
    "auto_disable_percent": 100,
    "repeated_error_limit": 5,
    "consecutive_errors": 0,
    "disabled_reason": None,
}


class UsageEvent(BaseModel):
    tiles_started: int = Field(default=0, ge=0, le=500)
    tiles_completed: int = Field(default=0, ge=0, le=500)
    tiles_failed: int = Field(default=0, ge=0, le=500)
    tiles_cancelled: int = Field(default=0, ge=0, le=500)


class SatelliteSettingsUpdate(BaseModel):
    enabled: bool
    daily_soft_limit: int = Field(ge=100, le=100_000_000)
    monthly_soft_limit: int = Field(ge=100, le=1_000_000_000)
    auto_disable_percent: int = Field(default=100, ge=50, le=200)
    repeated_error_limit: int = Field(default=5, ge=2, le=100)


class CredentialValue(BaseModel):
    value: str = Field(min_length=3, max_length=512)


def _setting(session: Session) -> tuple[SystemSetting | None, dict[str, object]]:
    row = session.get(SystemSetting, SETTING_KEY)
    return row, {**DEFAULTS, **(row.value if row else {})}


def _save_setting(session: Session, values: dict[str, object]) -> None:
    row = session.get(SystemSetting, SETTING_KEY)
    if row is None:
        session.add(SystemSetting(key=SETTING_KEY, value=values))
    else:
        row.value = values


def _credential(session: Session) -> SystemCredential | None:
    return session.get(SystemCredential, PROVIDER)


def _usage(session: Session) -> dict[str, int]:
    today = datetime.now(UTC).date()
    month_start = today.replace(day=1)
    daily = session.execute(select(
        func.coalesce(func.sum(GoogleSatelliteUsageDaily.sessions_started), 0),
        func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_started), 0),
        func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_completed), 0),
        func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_failed), 0),
        func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_cancelled), 0),
    ).where(GoogleSatelliteUsageDaily.usage_date == today)).one()
    monthly_tiles = session.scalar(select(func.coalesce(func.sum(GoogleSatelliteUsageDaily.tiles_started), 0)).where(GoogleSatelliteUsageDaily.usage_date >= month_start)) or 0
    return {"sessions_today": int(daily[0]), "tiles_started_today": int(daily[1]), "tiles_completed_today": int(daily[2]), "tiles_failed_today": int(daily[3]), "tiles_cancelled_today": int(daily[4]), "tiles_started_month": int(monthly_tiles)}


def _warning_level(values: dict[str, object], usage: dict[str, int]) -> int:
    percent = _usage_percent(values, usage)
    return 95 if percent >= 95 else 80 if percent >= 80 else 50 if percent >= 50 else 0


def _usage_percent(values: dict[str, object], usage: dict[str, int]) -> float:
    daily = usage["tiles_started_today"] * 100 / max(1, int(values["daily_soft_limit"]))
    monthly = usage["tiles_started_month"] * 100 / max(1, int(values["monthly_soft_limit"]))
    return max(daily, monthly)


def _status(session: Session) -> dict[str, object]:
    credential = _credential(session)
    _, values = _setting(session)
    usage = _usage(session)
    return {
        "configured": credential is not None,
        "masked_value": f"••••••••{credential.secret_last4}" if credential else None,
        "verified": bool(credential and credential.verified_at),
        "verified_at": credential.verified_at if credential else None,
        "last_used_at": credential.last_used_at if credential else None,
        "last_error_code": credential.last_error_code if credential else None,
        "available": bool(google_map_tiles_settings.enabled and values["enabled"] and credential and credential.verified_at),
        "settings": values,
        "usage": usage,
        "warning_level": _warning_level(values, usage),
        "authoritative_monitoring": {"connected": False, "console_url": "https://console.cloud.google.com/google/maps-apis/metrics", "notice": "La facturation Google Cloud reste la source autoritative."},
    }


def _api_key(credential: SystemCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


def _create_google_session(api_key: str, language: str = "fr") -> dict[str, object]:
    session_language = "en-US" if language.lower().startswith("en") else "fr-FR"
    request = Request(
        f"{google_map_tiles_settings.base_url}/v1/createSession?key={quote(api_key)}",
        data=json.dumps({"mapType": "satellite", "language": session_language}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "CartaVault/1", "Referer": f"{email_settings.frontend_public_url}/"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=google_map_tiles_settings.timeout_seconds) as response:
            payload = json.loads(response.read(256 * 1024))
    except HTTPError as error:
        code = "GOOGLE_MAP_TILES_QUOTA" if error.code == 429 else "GOOGLE_MAP_TILES_AUTH" if error.code in {401, 403} else "GOOGLE_MAP_TILES_UNAVAILABLE"
        raise HTTPException(503, {"code": code, "message": "Google Map Tiles est indisponible."}) from error
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise HTTPException(503, {"code": "GOOGLE_MAP_TILES_UNAVAILABLE", "message": "Google Map Tiles est indisponible."}) from error
    if not isinstance(payload, dict) or not isinstance(payload.get("session"), str):
        raise HTTPException(503, {"code": "GOOGLE_MAP_TILES_INVALID_RESPONSE", "message": "Google Map Tiles a renvoyé une réponse invalide."})
    return payload


def _record(session: Session, user_id: object, values: dict[str, int]) -> None:
    statement = insert(GoogleSatelliteUsageDaily).values(usage_date=datetime.now(UTC).date(), user_id=user_id, **values)
    statement = statement.on_conflict_do_update(
        constraint="google_satellite_usage_daily_date_user_key",
        set_={key: getattr(GoogleSatelliteUsageDaily, key) + value for key, value in values.items()},
    )
    session.execute(statement)


@router.get("/status")
def public_status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    del user
    status = _status(session)
    return {"available": status["available"], "warning_level": status["warning_level"]}


@router.post("/session")
def create_session(response: Response, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = _credential(session)
    _, values = _setting(session)
    usage = _usage(session)
    if not google_map_tiles_settings.enabled or not values["enabled"] or credential is None or credential.verified_at is None:
        raise HTTPException(503, {"code": "GOOGLE_SATELLITE_UNAVAILABLE", "message": "Le fond Google Satellite n’est pas configuré."})
    if _usage_percent(values, usage) >= int(values["auto_disable_percent"]):
        values["enabled"] = False; values["disabled_reason"] = "USAGE_THRESHOLD_REACHED"; _save_setting(session, values); session.commit()
        raise HTTPException(503, {"code": "GOOGLE_SATELLITE_USAGE_LIMIT", "message": "Le seuil d’usage local a désactivé Google Satellite."})
    try:
        language = str((user.preferences or {}).get("language", "fr"))
        payload = _create_google_session(_api_key(credential), language)
    except HTTPException as error:
        credential.last_error_code = str(error.detail.get("code")) if isinstance(error.detail, dict) else "GOOGLE_MAP_TILES_UNAVAILABLE"
        values["consecutive_errors"] = int(values["consecutive_errors"]) + 1
        if int(values["consecutive_errors"]) >= int(values["repeated_error_limit"]):
            values["enabled"] = False; values["disabled_reason"] = "REPEATED_PROVIDER_ERRORS"
        _save_setting(session, values); session.commit(); raise
    now = datetime.now(UTC).replace(tzinfo=None)
    credential.last_used_at = now; credential.last_error_code = None
    values["consecutive_errors"] = 0; values["last_success_at"] = now.isoformat(); values["disabled_reason"] = None
    _save_setting(session, values); _record(session, user.id, {"sessions_started": 1}); session.commit()
    response.headers["Cache-Control"] = "no-store"
    key = _api_key(credential)
    return {"tile_url": f"{google_map_tiles_settings.base_url}/v1/2dtiles/{{z}}/{{x}}/{{y}}?session={quote(str(payload['session']))}&key={quote(key)}", "expires": payload.get("expiry"), "attribution": "© Google", "max_zoom": 22}


@router.post("/usage", status_code=204)
def record_usage(event: UsageEvent, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    values = event.model_dump()
    if any(values.values()):
        _record(session, user.id, values)
        row, settings = _setting(session)
        del row
        if event.tiles_completed:
            settings["consecutive_errors"] = 0
        elif event.tiles_failed:
            settings["consecutive_errors"] = int(settings["consecutive_errors"]) + 1
            if int(settings["consecutive_errors"]) >= int(settings["repeated_error_limit"]):
                settings["enabled"] = False; settings["disabled_reason"] = "REPEATED_TILE_ERRORS"
        usage = _usage(session)
        if _usage_percent(settings, usage) >= int(settings["auto_disable_percent"]):
            settings["enabled"] = False; settings["disabled_reason"] = "USAGE_THRESHOLD_REACHED"
        _save_setting(session, settings); session.commit()
    return Response(status_code=204)


@admin_router.get("")
def admin_status(session: Session = Depends(get_db)) -> dict[str, object]:
    return _status(session)


@admin_router.put("/settings")
def update_settings(payload: SatelliteSettingsUpdate, session: Session = Depends(get_db)) -> dict[str, object]:
    _, current = _setting(session)
    current.update(payload.model_dump())
    if payload.enabled: current["disabled_reason"] = None; current["consecutive_errors"] = 0
    _save_setting(session, current); session.commit()
    return _status(session)


@admin_router.put("/credential")
def store_credential(payload: CredentialValue, session: Session = Depends(get_db)) -> dict[str, object]:
    value = payload.value.strip()
    try: encrypted = CredentialEncryptionService.from_settings().encrypt(value)
    except CredentialEncryptionError as error: raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
    credential = _credential(session)
    if credential is None:
        credential = SystemCredential(provider=PROVIDER, encrypted_secret=encrypted.ciphertext, encryption_version=encrypted.version, secret_last4=value[-4:]); session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext; credential.encryption_version = encrypted.version; credential.secret_last4 = value[-4:]; credential.verified_at = None; credential.last_error_code = None
    session.commit(); return _status(session)


@admin_router.post("/verify")
def verify_credential(session: Session = Depends(get_db)) -> dict[str, object]:
    credential = _credential(session)
    if credential is None: raise HTTPException(404, "Clé Google Map Tiles absente.")
    try: _create_google_session(_api_key(credential))
    except HTTPException as error:
        credential.verified_at = None; credential.last_error_code = str(error.detail.get("code")) if isinstance(error.detail, dict) else "GOOGLE_MAP_TILES_UNAVAILABLE"; session.commit(); raise
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None); credential.last_error_code = None; session.commit(); return _status(session)


@admin_router.delete("/credential", status_code=204)
def delete_credential(session: Session = Depends(get_db)) -> Response:
    credential = _credential(session)
    if credential: session.delete(credential)
    row, values = _setting(session); del row
    values["enabled"] = False; values["disabled_reason"] = "CREDENTIAL_REMOVED"; _save_setting(session, values); session.commit()
    return Response(status_code=204)


@admin_router.post("/reset-errors")
def reset_errors(session: Session = Depends(get_db)) -> dict[str, object]:
    credential = _credential(session)
    if credential: credential.last_error_code = None
    _, values = _setting(session); values["consecutive_errors"] = 0; values["disabled_reason"] = None; _save_setting(session, values); session.commit()
    return _status(session)
