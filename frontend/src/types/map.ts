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
}

export interface MapCreatePayload {
  country_id: string
  name?: string
  center_latitude?: number
  center_longitude?: number
  default_zoom?: number
}
