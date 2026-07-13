export interface PlaceStatusSummary {
  id: string
  name: string
  slug: string
  color: string
  is_active: boolean
}

export interface PlaceStatus extends PlaceStatusSummary {
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
  places_count: number
}

export interface PlaceStatusCreatePayload {
  name: string
  color: string
  sort_order: number
  is_default: boolean
  is_active: boolean
}

export type PlaceStatusUpdatePayload = Partial<PlaceStatusCreatePayload>
