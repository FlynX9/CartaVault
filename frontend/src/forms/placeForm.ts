import type { AssociationDiff, PlaceCreatePayload, PlaceDetails, PlaceFormErrors, PlaceFormValues, PlaceUpdatePayload } from '../types/place'

const FIELD_MAX_LENGTHS = { name: 255, region: 100, condition: 50, danger_level: 50 } as const
const NULLABLE_TEXT_FIELDS = ['description', 'region', 'condition', 'danger_level'] as const

export const EMPTY_PLACE_FORM_VALUES: PlaceFormValues = { name: '', mapId: '', statusId: '', description: '', region: '', condition: '', danger_level: '', latitude: '', longitude: '', categoryIds: [], primaryCategoryId: '', tagIds: [], isFavorite: false, interestRating: '', visitRating: '', visitDuration: '', links: [] }

function nullableText(value: string): string | null { const normalized = value.trim(); return normalized === '' ? null : normalized }
function parseCoordinate(value: string): number | null { if (value.trim() === '') return null; const coordinate = Number(value); return Number.isFinite(coordinate) ? coordinate : null }

export function validatePlaceForm(values: PlaceFormValues): PlaceFormErrors {
  const errors: PlaceFormErrors = {}
  const normalizedName = values.name.trim()
  if (!normalizedName) errors.name = 'Le nom est obligatoire.'
  else if (normalizedName.length > FIELD_MAX_LENGTHS.name) errors.name = `Le nom ne doit pas dépasser ${FIELD_MAX_LENGTHS.name} caractères.`
  if (!values.mapId) errors.mapId = 'La carte est obligatoire.'
  if (!values.statusId) errors.statusId = 'Le statut de suivi est obligatoire.'
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
  if (values.visitDuration !== '') {
    const duration = Number(values.visitDuration)
    if (!Number.isInteger(duration) || duration < 0 || duration > 1440) errors.visitDuration = 'La durée doit être un nombre entier compris entre 0 et 1440 minutes.'
  }
  const normalizedUrls = new Set<string>()
  for (const link of values.links) {
    const label = link.label.trim()
    const url = link.url.trim()
    if (!label) { errors.links = 'Chaque lien doit avoir un nom.'; break }
    if (label.length > 120) { errors.links = 'Le nom d’un lien ne doit pas dépasser 120 caractères.'; break }
    if (url.length > 2048) { errors.links = 'Une URL ne doit pas dépasser 2 048 caractères.'; break }
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host || /\s/.test(url)) throw new Error()
    } catch { errors.links = 'Les liens doivent utiliser une adresse HTTP ou HTTPS valide.'; break }
    if (normalizedUrls.has(url)) { errors.links = 'Une même URL ne peut être ajoutée qu’une fois.'; break }
    normalizedUrls.add(url)
  }
  if (values.links.length > 20) errors.links = 'Un POI ne peut pas contenir plus de 20 liens.'
  return errors
}

export function buildCreatePayload(values: PlaceFormValues): PlaceCreatePayload {
  const latitude = parseCoordinate(values.latitude); const longitude = parseCoordinate(values.longitude)
  if (latitude === null || longitude === null) throw new Error('Les coordonnées doivent être validées avant la création.')
  return { name: values.name.trim(), map_id: values.mapId, status_id: values.statusId, latitude, longitude, description: nullableText(values.description), region: nullableText(values.region), condition: nullableText(values.condition), danger_level: nullableText(values.danger_level), is_favorite: values.isFavorite, interest_rating: values.interestRating ? Number(values.interestRating) : null, visit_rating: values.visitRating ? Number(values.visitRating) : null, default_visit_duration_minutes: values.visitDuration === '' ? null : Number(values.visitDuration) }
}

export function buildMinimalUpdatePayload(initial: PlaceFormValues, current: PlaceFormValues): PlaceUpdatePayload {
  const payload: PlaceUpdatePayload = {}
  if (initial.name.trim() !== current.name.trim()) payload.name = current.name.trim()
  if (initial.mapId !== current.mapId) payload.map_id = current.mapId
  if (initial.statusId !== current.statusId) payload.status_id = current.statusId
  if (initial.isFavorite !== current.isFavorite) payload.is_favorite = current.isFavorite
  if (initial.interestRating !== current.interestRating) payload.interest_rating = current.interestRating ? Number(current.interestRating) : null
  if (initial.visitRating !== current.visitRating) payload.visit_rating = current.visitRating ? Number(current.visitRating) : null
  if (initial.visitDuration !== current.visitDuration) payload.default_visit_duration_minutes = current.visitDuration === '' ? null : Number(current.visitDuration)
  for (const field of NULLABLE_TEXT_FIELDS) { const before = nullableText(initial[field]); const after = nullableText(current[field]); if (before !== after) payload[field] = after }
  const beforeLat = parseCoordinate(initial.latitude); const beforeLon = parseCoordinate(initial.longitude); const lat = parseCoordinate(current.latitude); const lon = parseCoordinate(current.longitude)
  if (lat !== null && lon !== null && (beforeLat !== lat || beforeLon !== lon)) { payload.latitude = lat; payload.longitude = lon }
  return payload
}

export function calculateAssociationDiff(initialIds: string[], currentIds: string[]): AssociationDiff { const initial = new Set(initialIds); const current = new Set(currentIds); return { added: currentIds.filter((id) => !initial.has(id)), removed: initialIds.filter((id) => !current.has(id)) } }
export function placeDetailsToFormValues(place: PlaceDetails): PlaceFormValues { return { name: place.name, mapId: place.map_id, statusId: place.status.id, description: place.description ?? '', region: place.region ?? '', condition: place.condition ?? '', danger_level: place.danger_level ?? '', latitude: place.latitude?.toString() ?? '', longitude: place.longitude?.toString() ?? '', categoryIds: place.categories.map((category) => category.id), primaryCategoryId: place.categories.find((category) => category.is_primary)?.id ?? '', tagIds: place.tags.map((tag) => tag.id), isFavorite: place.is_favorite ?? false, interestRating: place.interest_rating?.toString() ?? '', visitRating: place.visit_rating?.toString() ?? '', visitDuration: place.default_visit_duration_minutes?.toString() ?? '', links: [...(place.links ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((link) => ({ clientId: link.id, id: link.id, label: link.label ?? '', url: link.url })) } }
export function mergeApiFieldErrors(current: PlaceFormErrors, apiErrors: Record<string, string>): PlaceFormErrors { const merged = { ...current }; for (const [field, message] of Object.entries(apiErrors)) { const normalized = field === 'map_id' ? 'mapId' : field === 'status_id' ? 'statusId' : field; if (normalized in EMPTY_PLACE_FORM_VALUES) merged[normalized as keyof PlaceFormValues] = message } return merged }
