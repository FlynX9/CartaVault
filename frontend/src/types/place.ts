export interface MapCategory {
  id: string
  name: string
}

export interface MapTag {
  id: string
  name: string
}

export interface PlaceCategory {
  id: string
  name: string
  description: string | null
}

export interface PlaceTag {
  id: string
  name: string
}

export interface PlaceDetails {
  id: string
  name: string
  description: string | null
  address: string | null
  country: string | null
  region: string | null
  construction_date: string | null
  abandonment_date: string | null
  condition: string | null
  access: string | null
  danger_level: string | null
  owner: string | null
  longitude: number | null
  latitude: number | null
  categories: PlaceCategory[]
  tags: PlaceTag[]
  created_at: string
  updated_at: string
}

export interface MapPlace {
  id: string
  name: string
  longitude: number
  latitude: number
  categories: MapCategory[]
  tags: MapTag[]
}

export interface MapBounds {
  minLatitude: number
  maxLatitude: number
  minLongitude: number
  maxLongitude: number
}

export interface MapView {
  center: [number, number]
  zoom: number
}

export interface MapPlaceQuery {
  bounds: MapBounds
  categoryId?: string
  tagId?: string
  limit?: number
}
