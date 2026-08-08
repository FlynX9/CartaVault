export type AnnotationShapeType = 'rectangle' | 'triangle' | 'circle' | 'line' | 'path'

export interface AnnotationTemplate {
  id: string
  map_id: string
  name: string
  shape_type: AnnotationShapeType
  icon: string
  color: string
  sort_order: number
  is_active: boolean
  usage_count: number
}

export interface PlaceAnnotation {
  id: string
  place_id: string
  template_id: string
  geometry: GeoJSON.Geometry
  radius_meters: number | null
  title: string | null
  description: string | null
  template: AnnotationTemplate
}

export interface PlaceAnnotationPayload {
  template_id: string
  geometry: GeoJSON.Geometry
  radius_meters?: number | null
  title?: string | null
  description?: string | null
}
