export type AdminSection = 'users' | 'credentials' | 'quotas' | 'instance'
export type AdminRole = 'admin' | 'user'
export type AdminUserState = 'active' | 'inactive' | 'deleted'

export interface AdminUser {
  id: string; email: string; display_name: string; role: AdminRole; state: AdminUserState
  created_at: string; updated_at: string; last_login_at: string | null
  owned_map_count: number; shared_map_count: number
}
export interface AdminUserPage { items: AdminUser[]; total: number; page: number; page_size: number; pages: number }

export interface CredentialStatus {
  provider: string; label: string; scope: 'instance' | 'personal' | 'infrastructure'
  configured: boolean; editable: boolean; source: 'database' | 'environment' | 'deployment' | 'none'
  masked_value: string | null; verified_at: string | null; last_used_at: string | null
  last_error_code: string | null; configured_user_count: number | null
}

export interface QuotaLimits {
  maps: number | null; places: number | null; photo_storage_bytes: number | null
  photo_file_bytes: number | null; members_per_map: number | null
}
export interface QuotaUsage {
  maps: number; places: number; photos: number; photo_storage_bytes: number | null; memberships: number
  imports: number | null; exports: number | null; route_calculations: number | null; google_routes_requests: number | null
}
export interface UserQuota { user_id: string; display_name: string; email: string; limits: QuotaLimits; overrides: QuotaLimits; usage: QuotaUsage }
export interface QuotaOverview { global_limits: QuotaLimits; aggregate_usage: QuotaUsage; users: UserQuota[]; unavailable_metrics: string[] }

export interface ServiceHealth { status: 'ok' | 'warning' | 'unavailable'; detail: string; version: string | null }
export interface InstanceHealth {
  application_version: string; checked_at: string; database_revision: string | null
  database: ServiceHealth; postgis: ServiceHealth; storage: ServiceHealth
  disk_total_bytes: number | null; disk_free_bytes: number | null
  credential_encryption: ServiceHealth; osrm: ServiceHealth; email: ServiceHealth; recent_errors: ServiceHealth
  counts: { users: number; maps: number; places: number; photos: number }
}
