export interface MapCategory {
  id: string
  name: string
}

export interface MapTag {
  id: string
  name: string
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

export interface MapPlaceQuery {
  bounds: MapBounds
  categoryId?: string
  tagId?: string
  limit?: number
}
