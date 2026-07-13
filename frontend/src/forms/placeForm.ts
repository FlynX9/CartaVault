import type { AssociationDiff, PlaceCreatePayload, PlaceDetails, PlaceFormErrors, PlaceFormValues, PlaceUpdatePayload } from '../types/place'

const FIELD_MAX_LENGTHS = { name: 255, region: 100, construction_date: 100, abandonment_date: 100, condition: 50, access: 50, danger_level: 50 } as const
const NULLABLE_TEXT_FIELDS = ['description', 'region', 'construction_date', 'abandonment_date', 'condition', 'access', 'danger_level'] as const

export const EMPTY_PLACE_FORM_VALUES: PlaceFormValues = { name: '', mapId: '', description: '', region: '', construction_date: '', abandonment_date: '', condition: '', access: '', danger_level: '', latitude: '', longitude: '', categoryIds: [], tagIds: [] }

function nullableText(value: string): string | null { const normalized = value.trim(); return normalized === '' ? null : normalized }
function parseCoordinate(value: string): number | null { if (value.trim() === '') return null; const coordinate = Number(value); return Number.isFinite(coordinate) ? coordinate : null }

export function validatePlaceForm(values: PlaceFormValues): PlaceFormErrors {
  const errors: PlaceFormErrors = {}
  const normalizedName = values.name.trim()
  if (!normalizedName) errors.name = 'Le nom est obligatoire.'
  else if (normalizedName.length > FIELD_MAX_LENGTHS.name) errors.name = `Le nom ne doit pas dépasser ${FIELD_MAX_LENGTHS.name} caractères.`
  if (!values.mapId) errors.mapId = 'La carte est obligatoire.'
  for (const [field, maxLength] of Object.entries(FIELD_MAX_LENGTHS)) {
    if (field === 'name') continue
    const typedField = field as keyof typeof FIELD_MAX_LENGTHS
    if (values[typedField].trim().length > maxLength) errors[typedField] = `Ce champ ne doit pas dépasser ${maxLength} caractères.`
  }
  const latitude = parseCoordinate(values.latitude); const longitude = parseCoordinate(values.longitude)
  if (latitude === null) errors.latitude = 'La latitude est obligatoire et doit être un nombre.'
  else if (latitude < -90 || latitude > 90) errors.latitude = 'La latitude doit être comprise entre -90 et 90.'
  if (longitude === null) errors.longitude = 'La longitude est obligatoire et doit être un nombre.'
  else if (longitude < -180 || longitude > 180) errors.longitude = 'La longitude doit être comprise entre -180 et 180.'
  return errors
}

export function buildCreatePayload(values: PlaceFormValues): PlaceCreatePayload {
  const latitude = parseCoordinate(values.latitude); const longitude = parseCoordinate(values.longitude)
  if (latitude === null || longitude === null) throw new Error('Les coordonnées doivent être validées avant la création.')
  return { name: values.name.trim(), map_id: values.mapId, latitude, longitude, description: nullableText(values.description), region: nullableText(values.region), construction_date: nullableText(values.construction_date), abandonment_date: nullableText(values.abandonment_date), condition: nullableText(values.condition), access: nullableText(values.access), danger_level: nullableText(values.danger_level) }
}

export function buildMinimalUpdatePayload(initial: PlaceFormValues, current: PlaceFormValues): PlaceUpdatePayload {
  const payload: PlaceUpdatePayload = {}
  if (initial.name.trim() !== current.name.trim()) payload.name = current.name.trim()
  if (initial.mapId !== current.mapId) payload.map_id = current.mapId
  for (const field of NULLABLE_TEXT_FIELDS) { const before = nullableText(initial[field]); const after = nullableText(current[field]); if (before !== after) payload[field] = after }
  const beforeLat = parseCoordinate(initial.latitude); const beforeLon = parseCoordinate(initial.longitude); const lat = parseCoordinate(current.latitude); const lon = parseCoordinate(current.longitude)
  if (lat !== null && lon !== null && (beforeLat !== lat || beforeLon !== lon)) { payload.latitude = lat; payload.longitude = lon }
  return payload
}

export function calculateAssociationDiff(initialIds: string[], currentIds: string[]): AssociationDiff { const initial = new Set(initialIds); const current = new Set(currentIds); return { added: currentIds.filter((id) => !initial.has(id)), removed: initialIds.filter((id) => !current.has(id)) } }
export function placeDetailsToFormValues(place: PlaceDetails): PlaceFormValues { return { name: place.name, mapId: place.map_id, description: place.description ?? '', region: place.region ?? '', construction_date: place.construction_date ?? '', abandonment_date: place.abandonment_date ?? '', condition: place.condition ?? '', access: place.access ?? '', danger_level: place.danger_level ?? '', latitude: place.latitude?.toString() ?? '', longitude: place.longitude?.toString() ?? '', categoryIds: place.categories.map((category) => category.id), tagIds: place.tags.map((tag) => tag.id) } }
export function mergeApiFieldErrors(current: PlaceFormErrors, apiErrors: Record<string, string>): PlaceFormErrors { const merged = { ...current }; for (const [field, message] of Object.entries(apiErrors)) { const normalized = field === 'map_id' ? 'mapId' : field; if (normalized in EMPTY_PLACE_FORM_VALUES) merged[normalized as keyof PlaceFormValues] = message } return merged }
