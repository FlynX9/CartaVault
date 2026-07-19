import type { CountrySummary } from './map'
import type { MapStatusSummary, PlaceStatusSummary } from './status'

export interface MapCategory { id: string; name: string; icon?: string; is_primary?: boolean }
export interface MapTag { id: string; name: string }
export interface PlaceCategory { id: string; name: string; description: string | null; icon?: string; is_primary?: boolean }
export interface PlaceTag { id: string; name: string }
export interface PlaceMapSummary { id: string; name: string; country: CountrySummary }

export interface PlaceDetails {
  id: string
  name: string
  map_id: string
  map: PlaceMapSummary
  status: PlaceStatusSummary
  description: string | null
  region: string | null
  construction_date: string | null
  abandonment_date: string | null
  condition: string | null
  access: string | null
  danger_level: string | null
  custom_fields?: Record<string, unknown>
  longitude: number | null
  latitude: number | null
  categories: PlaceCategory[]
  tags: PlaceTag[]
  created_at: string
  updated_at: string
}

export interface PreviewPlace { id: string; name: string; longitude: number | null; latitude: number | null; status: MapStatusSummary; categories: MapCategory[]; tags: MapTag[] }
export interface MapPlace extends PreviewPlace { map_id: string; longitude: number; latitude: number }
export interface MapBounds { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
export interface MapView { center: [number, number]; zoom: number }
export interface MapFocusRequest { id: number; view: MapView }
export interface DraftPosition { latitude: number; longitude: number }
export interface PlaceMutation { placeId: string; mapId: string }
export interface MapPlaceQuery { bounds: MapBounds; mapId?: string; categoryId?: string; tagId?: string; statusId?: string; limit?: number }
export interface MapPlaceResult { items: MapPlace[]; total: number; returned: number; truncated: boolean }
export interface PlaceListQuery { mapId?: string; statusId?: string; q?: string; limit?: number; offset?: number }
export type PlaceBulkAction = 'set_status' | 'add_category' | 'remove_category' | 'add_tag' | 'remove_tag' | 'delete'
export interface PlaceBulkPayload { place_ids: string[]; action: PlaceBulkAction; status_id?: string; category_id?: string; tag_id?: string }
export interface PlaceBulkResult { selected_count: number; updated_count: number; unchanged_count: number; deleted_count: number }

interface PlaceNullableFields { description: string | null; region: string | null; construction_date: string | null; abandonment_date: string | null; condition: string | null; access: string | null; danger_level: string | null; custom_fields?: Record<string, unknown> }
export interface PlaceCreatePayload extends PlaceNullableFields { name: string; map_id: string; status_id?: string; latitude: number; longitude: number }
export interface PlaceUpdatePayload { name?: string; map_id?: string; status_id?: string; description?: string | null; region?: string | null; construction_date?: string | null; abandonment_date?: string | null; condition?: string | null; access?: string | null; danger_level?: string | null; latitude?: number; longitude?: number }
export interface PlaceFormValues { name: string; mapId: string; statusId: string; description: string; region: string; construction_date: string; abandonment_date: string; condition: string; access: string; danger_level: string; latitude: string; longitude: string; categoryIds: string[]; primaryCategoryId: string; tagIds: string[] }
export type PlaceFormErrors = Partial<Record<keyof PlaceFormValues, string>>
export interface AssociationDiff { added: string[]; removed: string[] }
