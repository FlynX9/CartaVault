export interface CountrySummary {
  id: string
  iso_alpha2: string
  iso_alpha3: string
  name: string
}

export interface Country extends CountrySummary {
  center_latitude: number
  center_longitude: number
  default_zoom: number
  min_latitude: number | null
  max_latitude: number | null
  min_longitude: number | null
  max_longitude: number | null
  created_at: string
  updated_at: string
}

export interface PoiMap {
  id: string
  name: string
  country_id: string
  country: CountrySummary
  center_latitude: number | null
  center_longitude: number | null
  default_zoom: number | null
  effective_center_latitude: number
  effective_center_longitude: number
  effective_default_zoom: number
  min_latitude: number | null
  max_latitude: number | null
  min_longitude: number | null
  max_longitude: number | null
  created_at: string
  updated_at: string
  owner_id?: string
  is_private?: boolean
  is_shared?: boolean
  current_user_role?: 'admin' | 'owner' | 'editor' | 'viewer'
  can_edit?: boolean
  can_delete?: boolean
  can_manage_members?: boolean
  can_transfer_ownership?: boolean
  can_import?: boolean
  can_export?: boolean
  place_field_config?: Record<string, boolean>
}

export interface MapCreatePayload {
  country_id: string
  name?: string
  center_latitude?: number
  center_longitude?: number
  default_zoom?: number
}

export type MapRole = 'owner' | 'editor' | 'viewer'

export interface MapMember {
  user: {
    id: string
    email: string
    display_name: string
    is_admin: boolean
    is_active: boolean
    created_at: string
    updated_at: string
    last_login_at: string | null
  }
  role: MapRole
  created_at: string
  updated_at: string
}

export interface MapInvitation {
  id: string
  map_id: string
  email: string
  role: Exclude<MapRole, 'owner'>
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  invitation_url?: string | null
}

export interface PublicInvitation {
  map_name: string
  email: string
  role: Exclude<MapRole, 'owner'>
  expires_at: string
  requires_account: boolean
}

export interface PendingMapInvitation {
  id: string
  map_id: string
  map_name: string
  role: Exclude<MapRole, 'owner'>
  invited_by_display_name: string
  created_at: string
  expires_at: string
}
