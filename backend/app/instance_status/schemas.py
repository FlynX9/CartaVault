from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


InstanceStatusValue = Literal["operational", "degraded", "unavailable", "misconfigured", "unknown"]
AlembicStatusValue = Literal["up_to_date", "behind", "ahead", "diverged", "unknown"]
SecuritySeverity = Literal["info", "warning", "high", "critical"]


class DiagnosticBase(BaseModel):
    status: InstanceStatusValue
    checked_at: datetime
    error_code: str | None = None


class InstanceSummary(BaseModel):
    version: str
    environment: str
    uptime_seconds: int
    public_url: str | None


class ApplicationDiagnostic(DiagnosticBase):
    version: str
    backend_version: str
    frontend_version: str | None
    build_commit: str | None
    build_date: datetime | None
    environment: str
    started_at: datetime
    uptime_seconds: int
    public_url_configured: str | None
    public_url_detected: str | None
    deployment_mode: str
    backend_replicas: int | None
    debug_enabled: bool


class DatabaseDiagnostic(DiagnosticBase):
    connection_ok: bool
    latency_ms: float | None
    postgresql_version: str | None
    postgis_available: bool | None
    postgis_version: str | None
    database_size_bytes: int | None
    active_connections: int | None
    max_connections: int | None
    pool_size: int | None
    pool_checked_out: int | None
    pool_overflow: int | None
    alembic_current_revision: str | None
    alembic_expected_revision: str | None
    alembic_status: AlembicStatusValue
    last_controlled_error: str | None


class StorageDiagnostic(DiagnosticBase):
    backend_type: Literal["local", "s3", "unknown"]
    logical_identifier: str
    readable: bool | None
    writable: bool | None
    total_bytes: int | None
    used_bytes: int | None
    free_bytes: int | None
    usage_percent: float | None
    photo_count: int | None
    photo_storage_bytes: int | None
    temporary_export_count: int | None
    temporary_export_bytes: int | None
    temporary_file_count: int | None
    orphan_file_count: int | None
    warning_threshold_percent: float = 70
    high_threshold_percent: float = 85
    critical_threshold_percent: float = 95
    last_controlled_error: str | None


class UsageDiagnostic(DiagnosticBase):
    users_total: int | None
    users_active: int | None
    users_unverified: int | None
    users_disabled: int | None
    administrators_total: int | None
    maps_total: int | None
    maps_private: int | None
    maps_shared: int | None
    places_total: int | None
    trashed_places: int | None
    photos_total: int | None
    trips_total: int | None
    memberships_total: int | None
    invitations_pending: int | None
    storage_average_per_user_bytes: int | None
    new_users_7d: int | None
    new_users_30d: int | None
    new_places_7d: int | None
    new_places_30d: int | None


class AuthenticationDiagnostic(DiagnosticBase):
    password_hash_algorithm: str
    active_sessions: int | None
    expired_sessions_pending_cleanup: int | None
    session_ttl_seconds: int
    cookie_secure: bool
    cookie_http_only: bool
    cookie_same_site: str
    csrf_enabled: bool
    rate_limiting_enabled: bool | None
    failed_logins_24h: int | None
    temporarily_limited_accounts: int | None
    mfa_available: bool
    mfa_enabled_users: int
    mfa_required_for_admins: bool
    mfa_required_globally: bool


class HttpsDiagnostic(DiagnosticBase):
    https_detected: bool
    configured_public_scheme: str | None
    detected_request_scheme: str | None
    trusted_proxy_configured: bool
    forwarded_proto_consistent: bool | None
    canonical_url_consistent: bool | None
    certificate_available: bool | None
    certificate_valid: bool | None
    certificate_issuer: str | None
    certificate_not_before: datetime | None
    certificate_expires_at: datetime | None
    certificate_days_remaining: int | None
    http_to_https_redirect_configured: bool | None
    hsts_enabled: bool | None
    last_controlled_error: str | None


class EmailDiagnostic(DiagnosticBase):
    provider: str
    configured: bool | None
    sender_address: str | None
    reply_to_address: str | None
    sender_domain: str | None
    domain_verified: bool | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_error_code: str | None
    sent_24h: int | None
    failed_24h: int | None
    sent_30d: int | None
    failed_30d: int | None
    failure_rate: float | None
    quota_limit: int | None
    quota_used: int | None


class MappingDiagnostic(DiagnosticBase):
    osm_configured: bool
    light_layer_configured: bool | None
    dark_layer_configured: bool | None
    satellite_configured: bool | None
    stadia_configured: bool
    fallback_layer: str
    last_controlled_error: str | None


class RoutingDiagnostic(DiagnosticBase):
    default_provider: str
    osrm_configured: bool
    osrm_available: bool | None
    osrm_latency_ms: float | None
    google_routes_enabled: bool
    google_routes_global_configured: bool
    users_with_verified_google_routes_credentials: int | None
    fallback_to_osrm_enabled: bool
    last_provider: str | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_error_code: str | None


class MaintenanceDiagnostic(DiagnosticBase):
    expired_action_tokens: int | None
    expired_sessions: int | None
    expired_invitations: int | None
    temporary_exports_pending_cleanup: int | None
    temporary_files_pending_cleanup: int | None
    orphan_media_count: int | None
    last_cleanup_at: datetime | None
    next_cleanup_at: datetime | None
    cleanup_enabled: bool
    pending_migrations: bool | None


class BackupDiagnostic(DiagnosticBase):
    configured: bool
    known: bool
    last_database_backup_at: datetime | None
    last_media_backup_at: datetime | None
    last_secrets_backup_at: datetime | None
    last_backup_status: str | None
    last_backup_size_bytes: int | None
    destination_type: str | None
    last_restore_test_at: datetime | None
    retention_policy_known: bool
    last_controlled_error: str | None


class SecurityCheck(BaseModel):
    code: str
    severity: SecuritySeverity
    passed: bool | None
    message_key: str
    details: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    action: str | None = None


class SecurityDiagnostic(DiagnosticBase):
    disclaimer: str
    checks: list[SecurityCheck]


class RecentControlledError(BaseModel):
    timestamp: datetime
    component: str
    code: str
    severity: SecuritySeverity
    occurrence_count: int = 1
    status: str
    summary_key: str
    resolved: bool


class InstanceComponents(BaseModel):
    application: ApplicationDiagnostic
    database: DatabaseDiagnostic
    storage: StorageDiagnostic
    usage: UsageDiagnostic
    authentication: AuthenticationDiagnostic
    https: HttpsDiagnostic
    email: EmailDiagnostic
    mapping: MappingDiagnostic
    routing: RoutingDiagnostic
    maintenance: MaintenanceDiagnostic
    backups: BackupDiagnostic
    security: SecurityDiagnostic


class InstanceStatusResponse(BaseModel):
    checked_at: datetime
    global_status: InstanceStatusValue
    summary: InstanceSummary
    components: InstanceComponents
    recent_errors: list[RecentControlledError]
    warnings: list[str]
    cache_ttl_seconds: int
