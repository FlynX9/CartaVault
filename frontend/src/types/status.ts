export interface PlaceStatusSummary {
  id: string
  map_id: string
  name: string
  slug: string
  color: string
  is_active: boolean
  functional_state: 'non_visited' | 'visited'
}

export interface MapStatusSummary {
  id: string
  name: string
  slug: string
  color: string
  functional_state: 'non_visited' | 'visited'
}

export interface PlaceStatus extends PlaceStatusSummary {
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
  places_count: number
}

export interface PlaceStatusCreatePayload {
  map_id: string
  name: string
  functional_state: 'non_visited' | 'visited'
  color: string
  sort_order: number
  is_default: boolean
  is_active: boolean
}

export type PlaceStatusUpdatePayload = Partial<Omit<PlaceStatusCreatePayload, 'map_id'>>
