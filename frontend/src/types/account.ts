export interface AccountMapSummary { id: string; name: string }
export interface AccountProfile {
  id: string; email: string; email_verified: boolean; display_name: string; is_admin: boolean; is_active: boolean
  created_at: string; updated_at: string; last_login_at: string | null; avatar_url: string | null
  owned_maps: AccountMapSummary[]; shared_map_count: number; active_session_count: number; can_delete: boolean
}
export interface AccountSession {
  id: string; created_at: string; last_used_at: string; expires_at: string; user_agent: string | null; is_current: boolean
  city?: string | null; country?: string | null
}
export interface TotpSecurityStatus { enabled: boolean; verified_at: string | null; recovery_codes_remaining: number }
export interface TotpSetup { secret: string; provisioning_uri: string; qr_code_data_url: string; expires_at: string; issuer: string; account: string; digits: number; period: number }
export interface TotpRecoveryCodes { recovery_codes: string[] }

export interface AccountPreferences {
  language: 'fr' | 'en'
  default_theme: 'light' | 'dark' | 'system'
  preferred_basemap: 'cartavault-light' | 'cartavault-dark' | 'stadia-light' | 'stadia-dark' | 'google-roadmap' | 'osm' | 'satellite' | 'google-satellite' | 'google-satellite-tiles' | 'mapbox-satellite'
  density: 'compact' | 'comfortable' | 'spacious'
  startup_panel: 'dashboard' | 'maps' | 'places' | 'last'
  timezone: string
  trash_retention_days: number
  photo_markers_enabled: boolean
  onboarding: {
    dismissed: boolean
    completed_steps: Array<'map' | 'place' | 'import' | 'trip' | 'organization'>
  }
  routing: {
    provider: 'osrm' | 'google' | 'openrouteservice'
    api_key_id?: string | null
  }
  places: { provider: 'stadia' | 'google'; api_key_id?: string | null }
  basemaps?: { classic_provider?: 'osm' | 'stadia' | 'google'; satellite_provider: 'none' | 'stadia' | 'google' | 'mapbox'; google_satellite_mode?: 'maps-js' | 'map-tiles'; api_key_id?: string | null; stadia_api_key_id?: string | null; google_api_key_id?: string | null; google_maps_js_api_key_id?: string | null; mapbox_api_key_id?: string | null }
}

export interface PersonalApiKey {
  id: string
  name: string
  provider: 'google' | 'stadia' | 'mapbox' | 'openrouteservice'
  last4: string
  verified: boolean
  verified_at: string | null
  last_used_at: string | null
  last_error_code: string | null
  last_error_status: number | null
  last_error_message: string | null
  last_error_at: string | null
  created_at: string
  updated_at: string
  editable: boolean
}

export interface RoutingProviderCapability {
  id: 'osrm' | 'google' | 'openrouteservice'; label: string; available: boolean
  credential_configured?: boolean; credential_verified?: boolean
  self_hosted?: boolean; supported_profiles?: Array<'driving' | 'cycling' | 'walking'>
  supports_route: boolean; supports_matrix: boolean; supports_waypoint_optimization: boolean
}
export interface RoutingProvidersResponse { providers: RoutingProviderCapability[]; default_provider: 'osrm'; credential_storage_available: boolean }
