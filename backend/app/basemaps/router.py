from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.admin.models import SystemSetting
from app.auth.credential_encryption import CredentialEncryptionError, CredentialEncryptionService
from app.auth.api_keys import selected_api_key
from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User, UserApiCredential
from app.auth.provider_sessions import GoogleTilesSession, ProviderSessionError, decode_google_tiles_session, encode_google_tiles_session
from app.basemaps.models import GoogleSatelliteUsageDaily
from app.config import email_settings, google_map_tiles_settings, security_settings
from app.database import get_db
from app.quotas.registry import QuotaKey
from app.quotas.service import QuotaService
from app.trips.routing.base import RoutingError
from app.trips.routing.registry import GoogleRoutingRateLimiter, _routing_redis


router = APIRouter(prefix="/basemaps/google-satellite", tags=["basemaps"])
admin_router = APIRouter(prefix="/admin/console/google-satellite", tags=["admin-console"], dependencies=[Depends(require_admin)])
SETTING_KEY = "google_satellite"
GOOGLE_TILES_SESSION_COOKIE = "cartavault_google_tiles_session"
google_tiles_rate_limiter = GoogleRoutingRateLimiter(limit=1_200, redis_client=_routing_redis())
DEFAULTS: dict[str, object] = {
    "enabled": False,
    "daily_soft_limit": google_map_tiles_settings.daily_soft_limit,
    "monthly_soft_limit": google_map_tiles_settings.monthly_soft_limit,
    "auto_disable_percent": 100,
    "repeated_error_limit": 5,
    "consecutive_errors": 0,
    "disabled_reason": None,
}


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
    blocked = _instance_quota_reached(values, usage)
    if values.get("disabled_reason") == "USAGE_THRESHOLD_REACHED" and not blocked:
        values["enabled"] = True
        values["disabled_reason"] = None
    today = datetime.now(UTC).date()
    next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)
    return {
        "available": bool(google_map_tiles_settings.enabled and values["enabled"] and not blocked),
        "settings": values,
        "usage": usage,
        "warning_level": _warning_level(values, usage),
        "quota": {
            "scope": "instance",
            "daily_limit": _instance_limits(values)[0],
            "monthly_limit": _instance_limits(values)[1],
            "daily_reset_at": (today + timedelta(days=1)).isoformat(),
            "monthly_reset_at": next_month.isoformat(),
            "blocked": blocked,
            "reason": "USAGE_THRESHOLD_REACHED" if blocked else None,
        },
        "authoritative_monitoring": {"connected": True, "source": "backend_proxy", "console_url": "https://console.cloud.google.com/google/maps-apis/metrics", "notice": "CartaVault compte chaque requête proxy ; Google Cloud reste la référence de facturation."},
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


def _provider_expiry(value: object) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed > datetime.now(UTC):
                return parsed
        except ValueError:
            pass
    return datetime.now(UTC) + timedelta(hours=6)


def _record(session: Session, user: User, credential: UserApiCredential, values: dict[str, int]) -> None:
    statement = insert(GoogleSatelliteUsageDaily).values(
        usage_date=datetime.now(UTC).date(),
        user_id=user.id,
        credential_id=credential.id,
        quota_profile_id=user.quota_profile_id,
        **values,
    )
    statement = statement.on_conflict_do_update(
        index_elements=["usage_date", "user_id", "credential_id"],
        set_={key: getattr(GoogleSatelliteUsageDaily, key) + value for key, value in values.items()},
    )
    session.execute(statement)


def _instance_limits(values: dict[str, object]) -> tuple[int, int]:
    percent = int(values["auto_disable_percent"])
    return (
        max(1, int(values["daily_soft_limit"]) * percent // 100),
        max(1, int(values["monthly_soft_limit"]) * percent // 100),
    )


def _instance_quota_reached(values: dict[str, object], usage: dict[str, int], increment: int = 0) -> bool:
    daily_limit, monthly_limit = _instance_limits(values)
    return usage["tiles_started_today"] + increment > daily_limit or usage["tiles_started_month"] + increment > monthly_limit


def _user_quota_reached(session: Session, user: User, increment: int = 0) -> tuple[bool, str | None]:
    quota_service = QuotaService(session)
    profile = quota_service.effective_profile(user.id)
    for key in (QuotaKey.GOOGLE_SATELLITE_TILES_DAILY_MAX, QuotaKey.GOOGLE_SATELLITE_TILES_MONTHLY_MAX):
        limit = getattr(profile, key.value)
        if limit is not None and quota_service.usage(user.id, key) + increment > limit:
            return True, key.value
    return False, None


def _reserve_tile(session: Session, user: User, credential: UserApiCredential) -> None:
    """Atomically reserve one provider request across workers and future replicas."""

    session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": "cartavault:provider:google-satellite"})
    _, values = _setting(session)
    usage = _usage(session)
    if _instance_quota_reached(values, usage, increment=1):
        values["disabled_reason"] = "USAGE_THRESHOLD_REACHED"
        _save_setting(session, values)
        session.commit()
        raise HTTPException(429, {"code": "GOOGLE_SATELLITE_INSTANCE_QUOTA", "message": "Le quota partagé Google Satellite est atteint."})
    user_blocked, quota_key = _user_quota_reached(session, user, increment=1)
    if user_blocked:
        session.rollback()
        raise HTTPException(429, {"code": "GOOGLE_SATELLITE_USER_QUOTA", "message": "Votre quota Google Satellite est atteint.", "quota": quota_key})
    if values.get("disabled_reason") == "USAGE_THRESHOLD_REACHED":
        values["disabled_reason"] = None
        _save_setting(session, values)
    _record(session, user, credential, {"tiles_started": 1})
    session.commit()


@router.get("/status")
def public_status(session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = selected_api_key(session, user, "basemaps", "google")
    status = _admin_status(session)
    user_blocked, _ = _user_quota_reached(session, user)
    return {"available": bool(status["available"] and credential and not user_blocked), "warning_level": status["warning_level"]}


@router.post("/session")
def create_session(response: Response, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, object]:
    credential = selected_api_key(session, user, "basemaps", "google")
    _, values = _setting(session)
    usage = _usage(session)
    if values.get("disabled_reason") == "USAGE_THRESHOLD_REACHED" and not _instance_quota_reached(values, usage):
        values["enabled"] = True
        values["disabled_reason"] = None
        _save_setting(session, values)
        session.commit()
    if not google_map_tiles_settings.enabled or not values["enabled"] or credential is None:
        raise HTTPException(503, {"code": "GOOGLE_SATELLITE_UNAVAILABLE", "message": "Le fond Google Satellite n’est pas configuré."})
    if _instance_quota_reached(values, usage):
        raise HTTPException(503, {"code": "GOOGLE_SATELLITE_USAGE_LIMIT", "message": "Le seuil d’usage local a désactivé Google Satellite."})
    user_blocked, _ = _user_quota_reached(session, user)
    if user_blocked:
        raise HTTPException(429, {"code": "GOOGLE_SATELLITE_USER_QUOTA", "message": "Votre quota Google Satellite est atteint."})
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
    _save_setting(session, values); _record(session, user, credential, {"sessions_started": 1}); session.commit()
    expires_at = _provider_expiry(payload.get("expiry"))
    opaque_session = encode_google_tiles_session(GoogleTilesSession(user.id, credential.id, str(payload["session"]), expires_at))
    response.set_cookie(
        GOOGLE_TILES_SESSION_COOKIE,
        opaque_session,
        max_age=max(1, int((expires_at - datetime.now(UTC)).total_seconds())),
        httponly=True,
        secure=security_settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"tile_path": "/basemaps/google-satellite/tiles/{z}/{x}/{y}", "expires": expires_at.isoformat(), "attribution": "© Google", "max_zoom": 22}


@router.get("/tiles/{z}/{x}/{y}")
def tile(z: int, x: int, y: int, request: Request, session: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    maximum = (1 << z) - 1 if 0 <= z <= 22 else -1
    if x < 0 or y < 0 or x > maximum or y > maximum:
        raise HTTPException(404, "Tile not found")
    opaque_session = request.cookies.get(GOOGLE_TILES_SESSION_COOKIE)
    if not opaque_session:
        raise HTTPException(401, {"code": "GOOGLE_MAP_TILES_SESSION_REQUIRED", "message": "La session cartographique a expiré."})
    try:
        provider_session = decode_google_tiles_session(opaque_session)
    except ProviderSessionError as error:
        raise HTTPException(401, {"code": "GOOGLE_MAP_TILES_SESSION_INVALID", "message": "La session cartographique a expiré."}) from error
    credential = selected_api_key(session, user, "basemaps", "google")
    if provider_session.user_id != user.id or credential is None or credential.id != provider_session.credential_id:
        raise HTTPException(403, {"code": "GOOGLE_MAP_TILES_SESSION_FORBIDDEN", "message": "Cette session cartographique n’est plus autorisée."})
    try:
        google_tiles_rate_limiter.check(f"google-tiles:{user.id}")
    except RoutingError as error:
        raise HTTPException(429, {"code": "GOOGLE_MAP_TILES_RATE_LIMITED", "message": str(error)}) from error
    _reserve_tile(session, user, credential)
    upstream_request = UrlRequest(
        f"{google_map_tiles_settings.base_url}/v1/2dtiles/{z}/{x}/{y}?session={quote(provider_session.provider_session)}&key={quote(_api_key(credential))}",
        headers={"Accept": "image/*", "User-Agent": "CartaVault/1", "Referer": f"{email_settings.frontend_public_url}/"},
    )
    try:
        with urlopen(upstream_request, timeout=google_map_tiles_settings.timeout_seconds) as upstream:
            content = upstream.read(8 * 1024 * 1024)
            content_type = upstream.headers.get_content_type()
    except HTTPError as error:
        _record(session, user, credential, {"tiles_failed": 1}); session.commit()
        raise HTTPException(502, {"code": "GOOGLE_MAP_TILES_UPSTREAM_ERROR", "message": "Google Map Tiles est indisponible.", "provider_status": error.code}) from error
    except (URLError, TimeoutError, OSError) as error:
        _record(session, user, credential, {"tiles_failed": 1}); session.commit()
        raise HTTPException(503, {"code": "GOOGLE_MAP_TILES_UNAVAILABLE", "message": "Google Map Tiles est indisponible."}) from error
    _record(session, user, credential, {"tiles_completed": 1})
    session.commit()
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


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
