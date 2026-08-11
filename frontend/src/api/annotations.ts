import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readNullableString, readNumber, readString, readUuid } from './validation'
import type { AnnotationShapeType, AnnotationTemplate, PlaceAnnotation, PlaceAnnotationPayload } from '../types/annotation'

const shapes: ReadonlySet<string> = new Set(['rectangle', 'triangle', 'circle', 'line', 'path'])

function parseTemplate(value: unknown): AnnotationTemplate {
  const context = 'Le modèle d’annotation renvoyé par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  const shape = readString(value, 'shape_type', context)
  if (!shapes.has(shape)) throw new Error(`${context} contient une forme invalide.`)
  return { id: readUuid(value, 'id', context), map_id: readUuid(value, 'map_id', context), name: readString(value, 'name', context), shape_type: shape as AnnotationShapeType, icon: readString(value, 'icon', context), color: readString(value, 'color', context), sort_order: readNumber(value, 'sort_order', context), is_active: value.is_active === true, usage_count: readNumber(value, 'usage_count', context) }
}

function parseAnnotation(value: unknown): PlaceAnnotation {
  const context = 'L’annotation renvoyée par l’API'
  if (!isRecord(value) || !isRecord(value.geometry)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), place_id: readUuid(value, 'place_id', context), template_id: readUuid(value, 'template_id', context), geometry: value.geometry as unknown as GeoJSON.Geometry, radius_meters: typeof value.radius_meters === 'number' ? value.radius_meters : null, title: readNullableString(value, 'title', context), description: readNullableString(value, 'description', context), template: parseTemplate(value.template) }
}

export async function getAnnotationTemplates(mapId: string, signal?: AbortSignal): Promise<AnnotationTemplate[]> {
  const result = await getJson('/annotations/templates', new URLSearchParams({ map_id: mapId }), signal)
  if (!Array.isArray(result)) throw new Error('La liste des modèles d’annotation est invalide.')
  return result.map(parseTemplate)
}

export async function createAnnotationTemplate(payload: Pick<AnnotationTemplate, 'map_id' | 'name' | 'shape_type' | 'icon' | 'color' | 'sort_order' | 'is_active'>): Promise<AnnotationTemplate> {
  return parseTemplate(await sendJson('/annotations/templates', 'POST', payload))
}

export async function updateAnnotationTemplate(id: string, payload: Partial<Pick<AnnotationTemplate, 'name' | 'shape_type' | 'icon' | 'color' | 'sort_order' | 'is_active'>>): Promise<AnnotationTemplate> {
  return parseTemplate(await sendJson(`/annotations/templates/${encodeURIComponent(id)}`, 'PATCH', payload))
}

export async function deleteAnnotationTemplate(id: string): Promise<void> {
  await sendWithoutResponse(`/annotations/templates/${encodeURIComponent(id)}`, 'DELETE')
}

export async function getPlaceAnnotations(placeId: string, signal?: AbortSignal): Promise<PlaceAnnotation[]> {
  const result = await getJson(`/annotations/places/${encodeURIComponent(placeId)}`, new URLSearchParams(), signal)
  if (!Array.isArray(result)) throw new Error('La liste des annotations est invalide.')
  return result.map(parseAnnotation)
}

export async function createPlaceAnnotation(placeId: string, payload: PlaceAnnotationPayload): Promise<PlaceAnnotation> {
  return parseAnnotation(await sendJson(`/annotations/places/${encodeURIComponent(placeId)}`, 'POST', payload))
}

export async function updatePlaceAnnotation(placeId: string, annotationId: string, payload: Partial<PlaceAnnotationPayload>): Promise<PlaceAnnotation> {
  return parseAnnotation(await sendJson(`/annotations/places/${encodeURIComponent(placeId)}/${encodeURIComponent(annotationId)}`, 'PATCH', payload))
}

export async function deletePlaceAnnotation(placeId: string, annotationId: string): Promise<void> {
  await sendWithoutResponse(`/annotations/places/${encodeURIComponent(placeId)}/${encodeURIComponent(annotationId)}`, 'DELETE')
}
