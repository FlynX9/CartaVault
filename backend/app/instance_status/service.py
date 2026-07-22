from __future__ import annotations

import json
import os
import shutil
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from time import monotonic, perf_counter
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import Request as FastAPIRequest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth.models import AuthActionToken, SystemCredential, User, UserApiCredential, UserSession
from app.config import credential_settings, email_settings, routing_settings, security_settings
from app.exports.temporary_exports import EXPORT_ROOT
from app.maps.models import MapInvitation, MapMembership, PoiMap
from app.photos.models import Photo
from app.photos.storage import get_photo_storage_root
from app.places.models import Place
from app.trips.models import Trip
from app.instance_status.schemas import (
    ApplicationDiagnostic, AuthenticationDiagnostic, BackupDiagnostic, DatabaseDiagnostic,
    EmailDiagnostic, HttpsDiagnostic, InstanceComponents, InstanceStatusResponse, InstanceSummary,
    MaintenanceDiagnostic, MappingDiagnostic, RecentControlledError, RoutingDiagnostic,
    SecurityCheck, SecurityDiagnostic, StorageDiagnostic, UsageDiagnostic,
)


STARTED_AT = datetime.now(UTC)
CACHE_TTL_SECONDS = 30
BACKEND_ROOT = Path(__file__).resolve().parents[2]
_cache_lock = Lock()
_cache: tuple[float, InstanceStatusResponse] | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _naive_now() -> datetime:
    return _now().replace(tzinfo=None)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _application(request: FastAPIRequest, checked_at: datetime) -> ApplicationDiagnostic:
    version = os.getenv("CARTAVAULT_VERSION", "0.1.0")
    environment = os.getenv("CARTAVAULT_ENVIRONMENT", os.getenv("ENVIRONMENT", "development")).lower()
    debug = _env_bool("CARTAVAULT_DEBUG")
    configured_url = os.getenv("CARTAVAULT_PUBLIC_URL") or email_settings.frontend_public_url or None
    detected = f"{request.url.scheme}://{request.url.hostname}" if request.url.hostname in {"localhost", "127.0.0.1"} else None
    commit = os.getenv("CARTAVAULT_BUILD_COMMIT")
    build_date_raw = os.getenv("CARTAVAULT_BUILD_DATE")
    try:
        build_date = datetime.fromisoformat(build_date_raw.replace("Z", "+00:00")) if build_date_raw else None
    except ValueError:
        build_date = None
    status = "misconfigured" if environment == "production" and debug else "operational"
    return ApplicationDiagnostic(
        status=status, checked_at=checked_at, version=version, backend_version=version,
        frontend_version=os.getenv("CARTAVAULT_FRONTEND_VERSION"), build_commit=commit[:12] if commit else None,
        build_date=build_date, environment=environment, started_at=STARTED_AT,
        uptime_seconds=max(0, int((checked_at - STARTED_AT).total_seconds())),
        public_url_configured=configured_url, public_url_detected=detected,
        deployment_mode=os.getenv("CARTAVAULT_DEPLOYMENT_MODE", "local"),
        backend_replicas=int(os.getenv("CARTAVAULT_BACKEND_REPLICAS")) if os.getenv("CARTAVAULT_BACKEND_REPLICAS", "").isdigit() else None,
        debug_enabled=debug,
    )


def _alembic_state(session: Session) -> tuple[str | None, str | None, str]:
    try:
        current_rows = list(session.scalars(text("SELECT version_num FROM alembic_version")))
        current = ",".join(sorted(current_rows)) or None
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        heads = sorted(ScriptDirectory.from_config(config).get_heads())
        expected = ",".join(heads) or None
        if current is None or expected is None:
            state = "unknown"
        elif set(current_rows) == set(heads):
            state = "up_to_date"
        elif len(current_rows) == 1 and len(heads) == 1:
            script = ScriptDirectory.from_config(config)
            revisions_to_head = {item.revision for item in script.iterate_revisions(heads[0], "base")}
            revisions_from_current = {item.revision for item in script.iterate_revisions(current_rows[0], "base")}
            if current_rows[0] in revisions_to_head:
                state = "behind"
            elif heads[0] in revisions_from_current:
                state = "ahead"
            else:
                state = "diverged"
        else:
            state = "diverged"
        return current, expected, state
    except Exception:
        return None, None, "unknown"


def _database(session: Session, checked_at: datetime) -> DatabaseDiagnostic:
    started = perf_counter()
    try:
        session.execute(text("SET LOCAL statement_timeout = '1500ms'"))
        version = session.scalar(text("SELECT version()"))
        latency = round((perf_counter() - started) * 1000, 2)
        postgis = session.scalar(text("SELECT PostGIS_Version()"))
        size = session.scalar(text("SELECT pg_database_size(current_database())"))
        active = session.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"))
        maximum = session.scalar(text("SHOW max_connections"))
        current, expected, alembic_status = _alembic_state(session)
        bind = session.get_bind()
        engine = bind.engine if hasattr(bind, "engine") else bind
        pool = getattr(engine, "pool", None)
        status = "operational" if postgis and alembic_status == "up_to_date" else "degraded"
        return DatabaseDiagnostic(
            status=status, checked_at=checked_at, connection_ok=True, latency_ms=latency,
            postgresql_version=str(version).split(" on ")[0] if version else None,
            postgis_available=bool(postgis), postgis_version=str(postgis) if postgis else None,
            database_size_bytes=int(size) if size is not None else None,
            active_connections=int(active) if active is not None else None,
            max_connections=int(maximum) if maximum is not None else None,
            pool_size=pool.size() if pool is not None and hasattr(pool, "size") else None,
            pool_checked_out=pool.checkedout() if pool is not None and hasattr(pool, "checkedout") else None,
            pool_overflow=pool.overflow() if pool is not None and hasattr(pool, "overflow") else None,
            alembic_current_revision=current, alembic_expected_revision=expected,
            alembic_status=alembic_status, last_controlled_error=None,
        )
    except Exception:
        session.rollback()
        return DatabaseDiagnostic(
            status="unavailable", checked_at=checked_at, error_code="INSTANCE_DATABASE_UNAVAILABLE",
            connection_ok=False, latency_ms=None, postgresql_version=None, postgis_available=None,
            postgis_version=None, database_size_bytes=None, active_connections=None, max_connections=None,
            pool_size=None, pool_checked_out=None, pool_overflow=None, alembic_current_revision=None,
            alembic_expected_revision=None, alembic_status="unknown", last_controlled_error="INSTANCE_DATABASE_UNAVAILABLE",
        )


def _storage(session: Session, checked_at: datetime) -> StorageDiagnostic:
    root = get_photo_storage_root()
    readable = writable = False
    error_code = None
    try:
        root.mkdir(parents=True, exist_ok=True)
        readable = root.is_dir()
        with tempfile.NamedTemporaryFile(prefix=".cartavault-health-", dir=root, delete=True) as probe:
            probe.write(b"ok"); probe.flush()
        writable = True
        disk = shutil.disk_usage(root)
        usage = round(disk.used * 100 / disk.total, 2) if disk.total else None
    except OSError:
        disk = None; usage = None; error_code = "INSTANCE_STORAGE_PROBE_FAILED"
    photo_count = session.scalar(select(func.count()).select_from(Photo)) or 0
    export_files = [item for item in EXPORT_ROOT.glob("*") if item.is_file()] if EXPORT_ROOT.exists() else []
    status = "unavailable" if not readable or not writable else "degraded" if usage is not None and usage >= 85 else "operational"
    return StorageDiagnostic(
        status=status, checked_at=checked_at, error_code=error_code, backend_type="local",
        logical_identifier="local-media", readable=readable, writable=writable,
        total_bytes=disk.total if disk else None, used_bytes=disk.used if disk else None,
        free_bytes=disk.free if disk else None, usage_percent=usage, photo_count=photo_count,
        photo_storage_bytes=None, temporary_export_count=len(export_files),
        temporary_export_bytes=sum(item.stat().st_size for item in export_files),
        temporary_file_count=None, orphan_file_count=None, last_controlled_error=error_code,
    )


def _usage(session: Session, checked_at: datetime) -> UsageDiagnostic:
    now = _naive_now(); seven = now - timedelta(days=7); thirty = now - timedelta(days=30)
    scalar = lambda statement: int(session.scalar(statement) or 0)
    users = scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))
    maps = scalar(select(func.count()).select_from(PoiMap))
    places = scalar(select(func.count()).select_from(Place).where(Place.deleted_at.is_(None)))
    return UsageDiagnostic(
        status="operational", checked_at=checked_at, users_total=users,
        users_active=scalar(select(func.count()).select_from(User).where(User.is_active.is_(True), User.deleted_at.is_(None))),
        users_unverified=None,
        users_disabled=scalar(select(func.count()).select_from(User).where(User.is_active.is_(False), User.deleted_at.is_(None))),
        administrators_total=scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True), User.deleted_at.is_(None))),
        maps_total=maps, maps_private=scalar(select(func.count()).select_from(PoiMap).where(PoiMap.is_private.is_(True))),
        maps_shared=scalar(select(func.count()).select_from(PoiMap).where(PoiMap.is_private.is_(False))),
        places_total=places, trashed_places=scalar(select(func.count()).select_from(Place).where(Place.deleted_at.is_not(None))),
        photos_total=scalar(select(func.count()).select_from(Photo)), trips_total=scalar(select(func.count()).select_from(Trip)),
        memberships_total=scalar(select(func.count()).select_from(MapMembership)),
        invitations_pending=scalar(select(func.count()).select_from(MapInvitation).where(MapInvitation.accepted_at.is_(None), MapInvitation.revoked_at.is_(None), MapInvitation.expires_at > now)),
        storage_average_per_user_bytes=None,
        new_users_7d=scalar(select(func.count()).select_from(User).where(User.created_at >= seven)),
        new_users_30d=scalar(select(func.count()).select_from(User).where(User.created_at >= thirty)),
        new_places_7d=scalar(select(func.count()).select_from(Place).where(Place.created_at >= seven, Place.deleted_at.is_(None))),
        new_places_30d=scalar(select(func.count()).select_from(Place).where(Place.created_at >= thirty, Place.deleted_at.is_(None))),
    )


def _authentication(session: Session, checked_at: datetime) -> AuthenticationDiagnostic:
    now = _naive_now()
    active = session.scalar(select(func.count()).select_from(UserSession).where(UserSession.revoked_at.is_(None), UserSession.expires_at > now)) or 0
    expired = session.scalar(select(func.count()).select_from(UserSession).where(UserSession.expires_at <= now)) or 0
    return AuthenticationDiagnostic(
        status="operational", checked_at=checked_at, password_hash_algorithm="argon2id",
        active_sessions=active, expired_sessions_pending_cleanup=expired,
        session_ttl_seconds=security_settings.session_days * 86400, cookie_secure=security_settings.cookie_secure,
        cookie_http_only=True, cookie_same_site="lax", csrf_enabled=True, rate_limiting_enabled=None,
        failed_logins_24h=None, temporarily_limited_accounts=None, mfa_available=False,
        mfa_enabled_users=0, mfa_required_for_admins=False, mfa_required_globally=False,
    )


def _https(request: FastAPIRequest, checked_at: datetime, application: ApplicationDiagnostic) -> HttpsDiagnostic:
    configured_scheme = urlsplit(application.public_url_configured).scheme if application.public_url_configured else None
    detected_scheme = request.url.scheme
    detected = detected_scheme == "https"
    production = application.environment == "production"
    status = "misconfigured" if production and configured_scheme != "https" else "operational" if detected else "unknown"
    return HttpsDiagnostic(
        status=status, checked_at=checked_at, https_detected=detected,
        configured_public_scheme=configured_scheme or None, detected_request_scheme=detected_scheme,
        trusted_proxy_configured=_env_bool("CARTAVAULT_TRUST_PROXY"),
        forwarded_proto_consistent=None, canonical_url_consistent=None,
        certificate_available=None, certificate_valid=None, certificate_issuer=None,
        certificate_not_before=None, certificate_expires_at=None, certificate_days_remaining=None,
        http_to_https_redirect_configured=None, hsts_enabled=None, last_controlled_error=None,
    )


def _email(session: Session, checked_at: datetime) -> EmailDiagnostic:
    credential = session.get(SystemCredential, "resend")
    configured = credential is not None
    sender_domain = email_settings.from_address.partition("@")[2] or None
    return EmailDiagnostic(
        status="operational" if configured and credential.verified_at else "degraded" if configured else "misconfigured",
        checked_at=checked_at, provider=email_settings.provider, configured=configured,
        sender_address=email_settings.from_address, reply_to_address=email_settings.reply_to,
        sender_domain=sender_domain, domain_verified=True if credential and credential.verified_at else None,
        last_success_at=credential.last_used_at if credential else None, last_failure_at=None,
        last_error_code=credential.last_error_code if credential else None,
        sent_24h=None, failed_24h=None, sent_30d=None, failed_30d=None,
        failure_rate=None, quota_limit=None, quota_used=None,
    )


def _mapping(checked_at: datetime) -> MappingDiagnostic:
    return MappingDiagnostic(
        status="operational", checked_at=checked_at, osm_configured=True,
        light_layer_configured=None, dark_layer_configured=None,
        satellite_configured=None, stadia_configured=False, fallback_layer="osm",
        last_controlled_error=None,
    )


def _routing(session: Session, checked_at: datetime) -> RoutingDiagnostic:
    verified = session.scalar(select(func.count()).select_from(UserApiCredential).where(UserApiCredential.provider == "google_routes", UserApiCredential.verified_at.is_not(None))) or 0
    started = perf_counter()
    try:
        request = Request(f"{routing_settings.base_url.rstrip('/')}/route/v1/{routing_settings.profile}/2.3522,48.8566;2.3530,48.8570?overview=false", headers={"User-Agent": "CartaVault-health/1.0"})
        with urlopen(request, timeout=min(routing_settings.timeout_seconds, 2)) as response:  # noqa: S310 -- configured provider only
            payload = json.load(response)
        available = payload.get("code") == "Ok"; latency = round((perf_counter() - started) * 1000, 2)
        code = None if available else "OSRM_UNEXPECTED_RESPONSE"
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        available = False; latency = None; code = "OSRM_UNAVAILABLE"
    return RoutingDiagnostic(
        status="operational" if available else "degraded", checked_at=checked_at, error_code=code,
        default_provider="osrm", osrm_configured=bool(routing_settings.base_url), osrm_available=available,
        osrm_latency_ms=latency, google_routes_enabled=True,
        google_routes_global_configured=bool(credential_settings.encryption_key),
        users_with_verified_google_routes_credentials=verified, fallback_to_osrm_enabled=True,
        last_provider=None, last_success_at=None, last_failure_at=None, last_error_code=code,
    )


def _maintenance(session: Session, checked_at: datetime, database: DatabaseDiagnostic) -> MaintenanceDiagnostic:
    now = _naive_now()
    expired_tokens = session.scalar(select(func.count()).select_from(AuthActionToken).where(AuthActionToken.expires_at <= now, AuthActionToken.used_at.is_(None), AuthActionToken.revoked_at.is_(None))) or 0
    expired_sessions = session.scalar(select(func.count()).select_from(UserSession).where(UserSession.expires_at <= now)) or 0
    expired_invitations = session.scalar(select(func.count()).select_from(MapInvitation).where(MapInvitation.expires_at <= now, MapInvitation.accepted_at.is_(None), MapInvitation.revoked_at.is_(None))) or 0
    export_count = len([item for item in EXPORT_ROOT.glob("*") if item.is_file()]) if EXPORT_ROOT.exists() else 0
    pending = database.alembic_status != "up_to_date" if database.alembic_status != "unknown" else None
    return MaintenanceDiagnostic(
        status="degraded" if pending or expired_tokens or expired_sessions or expired_invitations else "operational",
        checked_at=checked_at, expired_action_tokens=expired_tokens, expired_sessions=expired_sessions,
        expired_invitations=expired_invitations, temporary_exports_pending_cleanup=export_count,
        temporary_files_pending_cleanup=None, orphan_media_count=None, last_cleanup_at=None,
        next_cleanup_at=None, cleanup_enabled=False, pending_migrations=pending,
    )


def _backups(checked_at: datetime) -> BackupDiagnostic:
    return BackupDiagnostic(
        status="unknown", checked_at=checked_at, configured=False, known=False,
        last_database_backup_at=None, last_media_backup_at=None, last_secrets_backup_at=None,
        last_backup_status=None, last_backup_size_bytes=None, destination_type=None,
        last_restore_test_at=None, retention_policy_known=False,
        last_controlled_error="BACKUP_STATUS_UNKNOWN",
    )


def _security(application: ApplicationDiagnostic, https: HttpsDiagnostic, email: EmailDiagnostic, backups: BackupDiagnostic, checked_at: datetime) -> SecurityDiagnostic:
    production = application.environment == "production"
    checks = [
        SecurityCheck(code="security.https_enabled", severity="high" if production else "info", passed=https.https_detected if production else None, message_key="admin.instanceStatus.security.https", action="Configure HTTPS at the trusted reverse proxy."),
        SecurityCheck(code="security.secure_cookie", severity="high" if production else "info", passed=security_settings.cookie_secure, message_key="admin.instanceStatus.security.secureCookie", action="Enable secure cookies in production."),
        SecurityCheck(code="security.csrf_enabled", severity="critical", passed=True, message_key="admin.instanceStatus.security.csrf"),
        SecurityCheck(code="security.debug_disabled", severity="high", passed=not application.debug_enabled, message_key="admin.instanceStatus.security.debug", action="Disable debug mode in production."),
        SecurityCheck(code="security.credential_encryption", severity="high", passed=bool(credential_settings.encryption_key), message_key="admin.instanceStatus.security.encryption", action="Configure the credential encryption key."),
        SecurityCheck(code="security.email_configured", severity="warning", passed=email.configured, message_key="admin.instanceStatus.security.email", action="Configure and verify Resend."),
        SecurityCheck(code="security.backup_known", severity="high", passed=True if backups.known else None, message_key="admin.instanceStatus.security.backup", action="Document backups and test a restore."),
        SecurityCheck(code="security.mfa_admins", severity="warning", passed=False, message_key="admin.instanceStatus.security.mfaAdmins", action="MFA is not available in this version."),
        SecurityCheck(code="security.public_registration", severity="info", passed=None, message_key="admin.instanceStatus.security.registration"),
    ]
    failed_high = any(item.passed is False and item.severity in {"high", "critical"} for item in checks)
    failed_warning = any(item.passed is False and item.severity == "warning" for item in checks)
    return SecurityDiagnostic(
        status="misconfigured" if failed_high else "degraded" if failed_warning else "operational",
        checked_at=checked_at,
        disclaimer="Cette page fournit des diagnostics de configuration et d’exécution. Elle ne remplace pas un audit de sécurité complet.",
        checks=checks,
    )


def _errors(components: InstanceComponents, checked_at: datetime) -> list[RecentControlledError]:
    errors: list[RecentControlledError] = []
    for name in ("database", "storage", "email", "routing", "https", "maintenance", "backups"):
        item = getattr(components, name)
        code = item.error_code or getattr(item, "last_controlled_error", None) or getattr(item, "last_error_code", None)
        if code:
            errors.append(RecentControlledError(timestamp=checked_at, component=name, code=code, severity="high" if item.status in {"unavailable", "misconfigured"} else "warning", status=item.status, summary_key=f"admin.instanceStatus.error.{code}", resolved=False))
    return errors[:20]


def _aggregate(components: InstanceComponents) -> str:
    mandatory = (components.application, components.database, components.storage)
    if any(item.status == "unavailable" for item in mandatory):
        return "unavailable"
    if any(item.status == "misconfigured" for item in mandatory) or components.security.status == "misconfigured":
        return "misconfigured"
    values = [
        components.application.status, components.database.status, components.storage.status,
        components.usage.status, components.authentication.status, components.https.status,
        components.email.status, components.mapping.status, components.routing.status,
        components.maintenance.status, components.backups.status, components.security.status,
    ]
    if any(value in {"degraded", "unavailable", "misconfigured"} for value in values):
        return "degraded"
    if all(value == "unknown" for value in values):
        return "unknown"
    return "operational"


def _rollback(session: Session) -> None:
    try:
        session.rollback()
    except Exception:
        pass


def _unknown_storage(checked_at: datetime, code: str) -> StorageDiagnostic:
    return StorageDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code, backend_type="unknown",
        logical_identifier="local-media", readable=None, writable=None, total_bytes=None,
        used_bytes=None, free_bytes=None, usage_percent=None, photo_count=None,
        photo_storage_bytes=None, temporary_export_count=None, temporary_export_bytes=None,
        temporary_file_count=None, orphan_file_count=None, last_controlled_error=code,
    )


def _unknown_usage(checked_at: datetime, code: str) -> UsageDiagnostic:
    return UsageDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code, users_total=None,
        users_active=None, users_unverified=None, users_disabled=None, administrators_total=None,
        maps_total=None, maps_private=None, maps_shared=None, places_total=None,
        trashed_places=None, photos_total=None, trips_total=None, memberships_total=None,
        invitations_pending=None, storage_average_per_user_bytes=None, new_users_7d=None,
        new_users_30d=None, new_places_7d=None, new_places_30d=None,
    )


def _unknown_authentication(checked_at: datetime, code: str) -> AuthenticationDiagnostic:
    return AuthenticationDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code,
        password_hash_algorithm="argon2id", active_sessions=None,
        expired_sessions_pending_cleanup=None, session_ttl_seconds=security_settings.session_days * 86400,
        cookie_secure=security_settings.cookie_secure, cookie_http_only=True, cookie_same_site="lax",
        csrf_enabled=True, rate_limiting_enabled=None, failed_logins_24h=None,
        temporarily_limited_accounts=None, mfa_available=False, mfa_enabled_users=0,
        mfa_required_for_admins=False, mfa_required_globally=False,
    )


def _unknown_email(checked_at: datetime, code: str) -> EmailDiagnostic:
    return EmailDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code, provider=email_settings.provider,
        configured=None, sender_address=email_settings.from_address, reply_to_address=email_settings.reply_to,
        sender_domain=email_settings.from_address.partition("@")[2] or None, domain_verified=None,
        last_success_at=None, last_failure_at=None, last_error_code=code, sent_24h=None,
        failed_24h=None, sent_30d=None, failed_30d=None, failure_rate=None, quota_limit=None,
        quota_used=None,
    )


def _unknown_routing(checked_at: datetime, code: str) -> RoutingDiagnostic:
    return RoutingDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code, default_provider="osrm",
        osrm_configured=bool(routing_settings.base_url), osrm_available=None, osrm_latency_ms=None,
        google_routes_enabled=True, google_routes_global_configured=bool(credential_settings.encryption_key),
        users_with_verified_google_routes_credentials=None, fallback_to_osrm_enabled=True,
        last_provider=None, last_success_at=None, last_failure_at=None, last_error_code=code,
    )


def _unknown_maintenance(checked_at: datetime, code: str) -> MaintenanceDiagnostic:
    return MaintenanceDiagnostic(
        status="unknown", checked_at=checked_at, error_code=code, expired_action_tokens=None,
        expired_sessions=None, expired_invitations=None, temporary_exports_pending_cleanup=None,
        temporary_files_pending_cleanup=None, orphan_media_count=None, last_cleanup_at=None,
        next_cleanup_at=None, cleanup_enabled=False, pending_migrations=None,
    )


def collect_instance_status(session: Session, request: FastAPIRequest) -> InstanceStatusResponse:
    checked_at = _now()
    application = _application(request, checked_at)
    database = _database(session, checked_at)
    try:
        storage = _storage(session, checked_at)
    except Exception:
        _rollback(session); storage = _unknown_storage(checked_at, "INSTANCE_STORAGE_CHECK_FAILED")
    try:
        usage = _usage(session, checked_at)
    except Exception:
        _rollback(session); usage = _unknown_usage(checked_at, "INSTANCE_USAGE_CHECK_FAILED")
    try:
        authentication = _authentication(session, checked_at)
    except Exception:
        _rollback(session); authentication = _unknown_authentication(checked_at, "INSTANCE_AUTH_CHECK_FAILED")
    https = _https(request, checked_at, application)
    try:
        email = _email(session, checked_at)
    except Exception:
        _rollback(session); email = _unknown_email(checked_at, "INSTANCE_EMAIL_CHECK_FAILED")
    mapping = _mapping(checked_at)
    try:
        routing = _routing(session, checked_at)
    except Exception:
        _rollback(session); routing = _unknown_routing(checked_at, "INSTANCE_ROUTING_CHECK_FAILED")
    try:
        maintenance = _maintenance(session, checked_at, database)
    except Exception:
        _rollback(session); maintenance = _unknown_maintenance(checked_at, "INSTANCE_MAINTENANCE_CHECK_FAILED")
    backups = _backups(checked_at)
    security = _security(application, https, email, backups, checked_at)
    components = InstanceComponents(application=application, database=database, storage=storage, usage=usage, authentication=authentication, https=https, email=email, mapping=mapping, routing=routing, maintenance=maintenance, backups=backups, security=security)
    global_status = _aggregate(components)
    warnings = [item.code for item in security.checks if item.passed is not True]
    return InstanceStatusResponse(
        checked_at=checked_at, global_status=global_status,
        summary=InstanceSummary(version=application.version, environment=application.environment, uptime_seconds=application.uptime_seconds, public_url=application.public_url_configured),
        components=components, recent_errors=_errors(components, checked_at), warnings=warnings,
        cache_ttl_seconds=CACHE_TTL_SECONDS,
    )


def get_instance_status(session: Session, request: FastAPIRequest, *, force: bool = False) -> InstanceStatusResponse:
    global _cache
    now = monotonic()
    with _cache_lock:
        if not force and _cache is not None and now - _cache[0] < CACHE_TTL_SECONDS:
            return _cache[1]
        result = collect_instance_status(session, request)
        _cache = (now, result)
        return result


def clear_instance_status_cache() -> None:
    global _cache
    with _cache_lock:
        _cache = None
