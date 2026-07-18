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
  preferred_basemap: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm'
  density: 'comfortable' | 'compact'
  startup_panel: 'maps' | 'places' | 'last'
  timezone: string
  routing: { stay_in_country: boolean }
}
