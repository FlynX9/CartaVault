export type AdminSection = 'users' | 'credentials' | 'quotas' | 'instance'
export type AdminRole = 'admin' | 'user'
export type AdminUserState = 'active' | 'inactive' | 'deleted'

export interface AdminUser {
  id: string; email: string; display_name: string; role: AdminRole; state: AdminUserState
  created_at: string; updated_at: string; last_login_at: string | null
  owned_map_count: number; shared_map_count: number
  quota_profile_id: string; quota_profile_name: string
}
export interface AdminUserPage { items: AdminUser[]; total: number; page: number; page_size: number; pages: number }

export interface CredentialStatus {
  provider: string; label: string; scope: 'instance' | 'personal' | 'infrastructure'
  configured: boolean; editable: boolean; source: 'database' | 'environment' | 'deployment' | 'none'
  masked_value: string | null; verified_at: string | null; last_used_at: string | null
  last_error_code: string | null; configured_user_count: number | null
}

export interface QuotaLimits {
  maps_max: number | null; trips_total_max: number | null; storage_bytes_max: number | null
  photos_total_max: number | null; memberships_total_max: number | null; pending_invitations_max: number | null
  places_per_map_max: number | null; tags_per_map_max: number | null; categories_per_map_max: number | null
  statuses_per_map_max: number | null; trips_per_map_max: number | null; members_per_map_max: number | null
  pending_invitations_per_map_max: number | null; photos_per_place_max: number | null
  links_per_place_max: number | null; days_per_trip_max: number | null; steps_per_day_max: number | null
}
export type QuotaKey = keyof QuotaLimits
export interface QuotaProfile {
  id: string; name: string; description: string | null; is_default: boolean; is_system: boolean; is_active: boolean
  limits: QuotaLimits; assigned_users_count: number; created_at: string; updated_at: string
}
export interface EffectiveQuota {
  user_id: string; profile: Pick<QuotaProfile, 'id' | 'name' | 'is_default' | 'is_system' | 'is_active' | 'limits'>
  quotas: Array<{ key: QuotaKey; scope: 'user' | 'map' | 'place' | 'trip' | 'day'; limit: number | null; usage: number | null; remaining: number | null; unlimited: boolean; over_limit: boolean; enforced: boolean }>
}
export interface QuotaRegistryItem {
  key: QuotaKey; scope: 'user' | 'map' | 'place' | 'trip' | 'day'; unit: 'count' | 'bytes'
  label: string; description: string; minimum: number; maximum: number; enforced: boolean
}

export type InstanceStatusValue = 'operational' | 'degraded' | 'unavailable' | 'misconfigured' | 'unknown'
export type SecuritySeverity = 'info' | 'warning' | 'high' | 'critical'

export interface DiagnosticBase { status: InstanceStatusValue; checked_at: string; error_code: string | null }
export interface ApplicationDiagnostic extends DiagnosticBase {
  version: string; backend_version: string; frontend_version: string | null; build_commit: string | null
  build_date: string | null; environment: string; started_at: string; uptime_seconds: number
  public_url_configured: string | null; public_url_detected: string | null; deployment_mode: string
  backend_replicas: number | null; debug_enabled: boolean
}
export interface DatabaseDiagnostic extends DiagnosticBase {
  connection_ok: boolean; latency_ms: number | null; postgresql_version: string | null
  postgis_available: boolean | null; postgis_version: string | null; database_size_bytes: number | null
  active_connections: number | null; max_connections: number | null; pool_size: number | null
  pool_checked_out: number | null; pool_overflow: number | null; alembic_current_revision: string | null
  alembic_expected_revision: string | null; alembic_status: 'up_to_date' | 'behind' | 'ahead' | 'diverged' | 'unknown'
  last_controlled_error: string | null
}
export interface StorageDiagnostic extends DiagnosticBase {
  backend_type: 'local' | 's3' | 'unknown'; logical_identifier: string; readable: boolean | null
  writable: boolean | null; total_bytes: number | null; used_bytes: number | null; free_bytes: number | null
  usage_percent: number | null; photo_count: number | null; photo_storage_bytes: number | null
  temporary_export_count: number | null; temporary_export_bytes: number | null; temporary_file_count: number | null
  orphan_file_count: number | null; warning_threshold_percent: number; high_threshold_percent: number
  critical_threshold_percent: number; last_controlled_error: string | null
}
export interface UsageDiagnostic extends DiagnosticBase {
  users_total: number | null; users_active: number | null; users_unverified: number | null; users_disabled: number | null
  administrators_total: number | null; maps_total: number | null; maps_private: number | null; maps_shared: number | null
  places_total: number | null; trashed_places: number | null; photos_total: number | null; trips_total: number | null
  memberships_total: number | null; invitations_pending: number | null; storage_average_per_user_bytes: number | null
  new_users_7d: number | null; new_users_30d: number | null; new_places_7d: number | null; new_places_30d: number | null
}
export interface AuthenticationDiagnostic extends DiagnosticBase {
  password_hash_algorithm: string; active_sessions: number | null; expired_sessions_pending_cleanup: number | null
  session_ttl_seconds: number; cookie_secure: boolean; cookie_http_only: boolean; cookie_same_site: string
  csrf_enabled: boolean; rate_limiting_enabled: boolean | null; failed_logins_24h: number | null
  temporarily_limited_accounts: number | null; mfa_available: boolean; mfa_enabled_users: number
  mfa_required_for_admins: boolean; mfa_required_globally: boolean
}
export interface HttpsDiagnostic extends DiagnosticBase {
  https_detected: boolean; configured_public_scheme: string | null; detected_request_scheme: string | null
  trusted_proxy_configured: boolean; forwarded_proto_consistent: boolean | null; canonical_url_consistent: boolean | null
  certificate_available: boolean | null; certificate_valid: boolean | null; certificate_issuer: string | null
  certificate_not_before: string | null; certificate_expires_at: string | null; certificate_days_remaining: number | null
  http_to_https_redirect_configured: boolean | null; hsts_enabled: boolean | null; last_controlled_error: string | null
}
export interface EmailDiagnostic extends DiagnosticBase {
  provider: string; configured: boolean | null; sender_address: string | null; reply_to_address: string | null
  sender_domain: string | null; domain_verified: boolean | null; last_success_at: string | null
  last_failure_at: string | null; last_error_code: string | null; sent_24h: number | null
  failed_24h: number | null; sent_30d: number | null; failed_30d: number | null
  failure_rate: number | null; quota_limit: number | null; quota_used: number | null
}
export interface MappingDiagnostic extends DiagnosticBase {
  osm_configured: boolean; light_layer_configured: boolean | null; dark_layer_configured: boolean | null
  satellite_configured: boolean | null; stadia_configured: boolean; fallback_layer: string
  last_controlled_error: string | null
}
export interface RoutingDiagnostic extends DiagnosticBase {
  default_provider: string; osrm_configured: boolean; osrm_available: boolean | null; osrm_latency_ms: number | null
  google_routes_enabled: boolean; google_routes_global_configured: boolean
  users_with_verified_google_routes_credentials: number | null; fallback_to_osrm_enabled: boolean
  last_provider: string | null; last_success_at: string | null; last_failure_at: string | null; last_error_code: string | null
}
export interface MaintenanceDiagnostic extends DiagnosticBase {
  expired_action_tokens: number | null; expired_sessions: number | null; expired_invitations: number | null
  temporary_exports_pending_cleanup: number | null; temporary_files_pending_cleanup: number | null
  orphan_media_count: number | null; last_cleanup_at: string | null; next_cleanup_at: string | null
  cleanup_enabled: boolean; pending_migrations: boolean | null
}
export interface BackupDiagnostic extends DiagnosticBase {
  configured: boolean; known: boolean; last_database_backup_at: string | null; last_media_backup_at: string | null
  last_secrets_backup_at: string | null; last_backup_status: string | null; last_backup_size_bytes: number | null
  destination_type: string | null; last_restore_test_at: string | null; retention_policy_known: boolean
  last_controlled_error: string | null
}
export interface SecurityCheck {
  code: string; severity: SecuritySeverity; passed: boolean | null; message_key: string
  details: Record<string, string | number | boolean | null>; action: string | null
}
export interface SecurityDiagnostic extends DiagnosticBase { disclaimer: string; checks: SecurityCheck[] }
export interface RecentControlledError {
  timestamp: string; component: string; code: string; severity: SecuritySeverity
  occurrence_count: number; status: string; summary_key: string; resolved: boolean
}
export interface InstanceHealth {
  checked_at: string; global_status: InstanceStatusValue
  summary: { version: string; environment: string; uptime_seconds: number; public_url: string | null }
  components: {
    application: ApplicationDiagnostic; database: DatabaseDiagnostic; storage: StorageDiagnostic
    usage: UsageDiagnostic; authentication: AuthenticationDiagnostic; https: HttpsDiagnostic
    email: EmailDiagnostic; mapping: MappingDiagnostic; routing: RoutingDiagnostic
    maintenance: MaintenanceDiagnostic; backups: BackupDiagnostic; security: SecurityDiagnostic
  }
  recent_errors: RecentControlledError[]; warnings: string[]; cache_ttl_seconds: number
}
