from __future__ import annotations

import json
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_api_key
from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User, UserApiCredential
from app.auth.security import verify_password
from app.basemaps.models import GoogleSatelliteUsageDaily
from app.config import email_settings, google_map_tiles_settings
from app.database import get_db


router = APIRouter(prefix="/basemaps/google-satellite", tags=["basemaps"])
admin_router = APIRouter(prefix="/admin/console/google-satellite", tags=["admin-console"], dependencies=[Depends(require_admin)])
credential_router = APIRouter(prefix="/account/integrations/google-map-tiles", tags=["account"])
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


def _setting(session: Session) -> tuple[SystemSetting | None, dict[str, object]]:
    row = session.get(SystemSetting, SETTING_KEY)
    return row, {**DEFAULTS, **(row.value if row else {})}


def _save_setting(session: Session, values: dict[str, object]) -> None:
    row = session.get(SystemSetting, SETTING_KEY)
    if row is None:
        session.add(SystemSetting(key=SETTING_KEY, value=values))
    else:
        row.value = values


def _credential(session: Session, user_id: object) -> UserApiCredential | None:
    return session.scalar(select(UserApiCredential).where(UserApiCredential.user_id == user_id, UserApiCredential.provider == PROVIDER))


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


def _admin_status(session: Session) -> dict[str, object]:
    _, values = _setting(session)
    usage = _usage(session)
    return {
        "available": bool(google_map_tiles_settings.enabled and values["enabled"]),
        "settings": values,
        "usage": usage,
        "warning_level": _warning_level(values, usage),
        "authoritative_monitoring": {"connected": False, "console_url": "https://console.cloud.google.com/google/maps-apis/metrics", "notice": "La facturation Google Cloud reste la source autoritative."},
    }


def _credential_status(credential: UserApiCredential | None) -> dict[str, object]:
    return {
        "configured": credential is not None,
        "last4": credential.secret_last4 if credential else None,
        "verified": bool(credential and credential.verified_at),
        "verified_at": credential.verified_at if credential else None,
        "last_used_at": credential.last_used_at if credential else None,
        "last_error_code": credential.last_error_code if credential else None,
    }


def _api_key(credential: UserApiCredential) -> str:
    try:
        return CredentialEncryptionService.from_settings().decrypt(credential.encrypted_secret, credential.encryption_version)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error


def _create_google_session(api_key: str, language: str = "fr") -> dict[str, object]:
    session_language = "en-US" if language.lower().startswith("en") else "fr-FR"
    request = UrlRequest(
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
    credential = selected_api_key(session, user, "basemaps", "google")
    status = _admin_status(session)
    return {"available": bool(status["available"] and credential), "warning_level": status["warning_level"]}


@router.post("/session")
def create_session(response: Response, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = selected_api_key(session, user, "basemaps", "google")
    _, values = _setting(session)
    usage = _usage(session)
    if not google_map_tiles_settings.enabled or not values["enabled"] or credential is None:
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


async def _json_object(request: Request) -> dict[str, object]:
    try:
        payload = await request.json()
    except Exception as error:
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."}) from error
    if not isinstance(payload, dict):
        raise HTTPException(400, {"code": "CREDENTIAL_PAYLOAD_INVALID", "message": "La requête est invalide."})
    return payload


@credential_router.get("")
def user_credential_status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    return _credential_status(_credential(session, user.id))


@credential_router.put("")
async def store_user_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    value = (await _json_object(request)).get("api_key")
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 512:
        raise HTTPException(422, {"code": "CREDENTIAL_VALUE_INVALID", "message": "Une clé Google Map Tiles est requise."})
    api_key = value.strip()
    try:
        encrypted = CredentialEncryptionService.from_settings().encrypt(api_key)
    except CredentialEncryptionError as error:
        raise HTTPException(503, {"code": error.code, "message": str(error)}) from error
    credential = _credential(session, user.id)
    if credential is None:
        credential = UserApiCredential(
            user_id=user.id,
            provider=PROVIDER,
            encrypted_secret=encrypted.ciphertext,
            encryption_version=encrypted.version,
            secret_last4=api_key[-4:],
        )
        session.add(credential)
    else:
        credential.encrypted_secret = encrypted.ciphertext
        credential.encryption_version = encrypted.version
        credential.secret_last4 = api_key[-4:]
        credential.verified_at = None
        credential.last_used_at = None
        credential.last_error_code = None
    session.commit()
    return _credential_status(credential)


@credential_router.post("/verify")
def verify_user_credential(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = _credential(session, user.id)
    if credential is None:
        raise HTTPException(404, {"code": "GOOGLE_MAP_TILES_CREDENTIAL_NOT_CONFIGURED", "message": "Aucune clé Google Map Tiles n’est configurée."})
    try:
        _create_google_session(_api_key(credential), str((user.preferences or {}).get("language", "fr")))
    except HTTPException as error:
        credential.verified_at = None
        credential.last_error_code = str(error.detail.get("code")) if isinstance(error.detail, dict) else "GOOGLE_MAP_TILES_UNAVAILABLE"
        session.commit()
        raise
    credential.verified_at = datetime.now(UTC).replace(tzinfo=None)
    credential.last_error_code = None
    session.commit()
    return _credential_status(credential)


@credential_router.delete("")
async def delete_user_credential(request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    password = (await _json_object(request)).get("current_password")
    if not isinstance(password, str) or not verify_password(user.password_hash, password)[0]:
        raise HTTPException(400, {"code": "CURRENT_PASSWORD_INVALID", "message": "Le mot de passe actuel est incorrect."})
    credential = _credential(session, user.id)
    if credential is not None:
        session.delete(credential)
    preferences = dict(user.preferences or {})
    provider_reset = preferences.get("preferred_basemap") == "google-satellite"
    if provider_reset:
        preferences["preferred_basemap"] = "cartavault-light"
        user.preferences = preferences
    session.commit()
    return {"deleted": credential is not None, "provider_reset": provider_reset, "basemap": "cartavault-light"}


@admin_router.get("")
def admin_status(session: Session = Depends(get_db)) -> dict[str, object]:
    return _admin_status(session)


@admin_router.put("/settings")
def update_settings(payload: SatelliteSettingsUpdate, session: Session = Depends(get_db)) -> dict[str, object]:
    _, current = _setting(session)
    current.update(payload.model_dump())
    if payload.enabled: current["disabled_reason"] = None; current["consecutive_errors"] = 0
    _save_setting(session, current); session.commit()
    return _admin_status(session)


@admin_router.post("/reset-errors")
def reset_errors(session: Session = Depends(get_db)) -> dict[str, object]:
    _, values = _setting(session); values["consecutive_errors"] = 0; values["disabled_reason"] = None; _save_setting(session, values); session.commit()
    return _admin_status(session)
