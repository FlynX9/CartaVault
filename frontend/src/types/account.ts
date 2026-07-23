export interface AccountMapSummary { id: string; name: string }
export interface AccountProfile {
  id: string; email: string; display_name: string; is_admin: boolean; is_active: boolean
  created_at: string; updated_at: string; last_login_at: string | null; avatar_url: string | null
  owned_maps: AccountMapSummary[]; shared_map_count: number; active_session_count: number; can_delete: boolean
}
export interface AccountSession {
  id: string; created_at: string; last_used_at: string; expires_at: string; user_agent: string | null; is_current: boolean
}

export interface AccountPreferences {
  language: 'fr' | 'en'
  preferred_basemap: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm'
  density: 'comfortable' | 'compact'
  startup_panel: 'maps' | 'places' | 'last'
  timezone: string
  routing: {
    provider: 'osrm' | 'google'
    stay_in_country: boolean
    avoid_tolls: boolean
    avoid_highways: boolean
    avoid_ferries: boolean
    traffic_mode: 'traffic_unaware' | 'traffic_aware' | 'traffic_aware_optimal'
  }
}

export interface RoutingProviderCapability {
  id: 'osrm' | 'google'; label: string; available: boolean
  credential_configured?: boolean; credential_verified?: boolean
  supports_route: boolean; supports_matrix: boolean; supports_waypoint_optimization: boolean
}
export interface RoutingProvidersResponse { providers: RoutingProviderCapability[]; default_provider: 'osrm'; credential_storage_available: boolean }

export interface GoogleRoutesCredentialStatus {
  configured: boolean
  last4: string | null
  verified: boolean
  verified_at: string | null
  last_used_at: string | null
  last_error_code: string | null
}

export interface GoogleRoutesCredentialDeletion {
  deleted: boolean
  provider_reset: boolean
  provider: 'osrm' | 'google'
}
