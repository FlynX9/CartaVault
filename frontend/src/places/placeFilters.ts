import type { PlaceFilters } from '../types/place'

export const DEFAULT_PLACE_FILTERS: PlaceFilters = {
  query: '', categoryIds: [], tagIds: [], statusIds: [], regions: [], hasPhotos: null,
  createdFrom: null, createdTo: null, updatedFrom: null, updatedTo: null,
  accessValues: [], dangerLevels: [], conditionValues: [], hasValidCoordinates: null, inTrip: null,
  isFavorite: null, functionalState: null, ratingMin: null, sortBy: 'name', sortDirection: 'asc',
}

const listKeys = ['categoryIds', 'tagIds', 'statusIds', 'regions', 'accessValues', 'dangerLevels', 'conditionValues'] as const
const queryKeys: Record<keyof PlaceFilters, string> = {
  query: 'q', categoryIds: 'categories', tagIds: 'tags', statusIds: 'statuses', regions: 'regions', hasPhotos: 'has_photos',
  createdFrom: 'created_from', createdTo: 'created_to', updatedFrom: 'updated_from', updatedTo: 'updated_to',
  accessValues: 'access', dangerLevels: 'danger', conditionValues: 'condition', hasValidCoordinates: 'has_coordinates', inTrip: 'in_trip',
  isFavorite: 'favorite', functionalState: 'visit_state', ratingMin: 'rating_min', sortBy: 'sort', sortDirection: 'direction',
}

const normalizeList = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
const normalizeDate = (value: string | null) => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
const triState = (value: string | null) => value === 'true' ? true : value === 'false' ? false : null

export function normalizePlaceFilters(filters: PlaceFilters): PlaceFilters {
  const normalized = { ...DEFAULT_PLACE_FILTERS, ...filters, query: filters.query.trim() }
  for (const key of listKeys) normalized[key] = normalizeList(normalized[key])
  normalized.createdFrom = normalizeDate(normalized.createdFrom); normalized.createdTo = normalizeDate(normalized.createdTo)
  normalized.updatedFrom = normalizeDate(normalized.updatedFrom); normalized.updatedTo = normalizeDate(normalized.updatedTo)
  normalized.ratingMin = normalized.ratingMin && normalized.ratingMin >= 1 && normalized.ratingMin <= 5 ? normalized.ratingMin : null
  if (normalized.createdFrom && normalized.createdTo && normalized.createdFrom > normalized.createdTo) normalized.createdTo = null
  if (normalized.updatedFrom && normalized.updatedTo && normalized.updatedFrom > normalized.updatedTo) normalized.updatedTo = null
  return normalized
}

export function serializePlaceFilters(filters: PlaceFilters): URLSearchParams {
  const value = normalizePlaceFilters(filters); const params = new URLSearchParams()
  if (value.query) params.set(queryKeys.query, value.query)
  for (const key of listKeys) if (value[key].length) params.set(queryKeys[key], value[key].join(','))
  for (const key of ['createdFrom', 'createdTo', 'updatedFrom', 'updatedTo'] as const) if (value[key]) params.set(queryKeys[key], value[key])
  for (const key of ['hasPhotos', 'hasValidCoordinates', 'inTrip'] as const) if (value[key] !== null) params.set(queryKeys[key], String(value[key]))
  if (value.isFavorite !== null) params.set(queryKeys.isFavorite, String(value.isFavorite))
  if (value.functionalState !== null) params.set(queryKeys.functionalState, value.functionalState)
  if (value.ratingMin !== null) params.set(queryKeys.ratingMin, String(value.ratingMin))
  if (value.sortBy !== 'name') params.set(queryKeys.sortBy, value.sortBy)
  if (value.sortDirection !== 'asc') params.set(queryKeys.sortDirection, value.sortDirection)
  return params
}

export function deserializePlaceFilters(params: URLSearchParams): PlaceFilters {
  const result: PlaceFilters = { ...DEFAULT_PLACE_FILTERS }
  result.query = params.get('q') ?? ''
  for (const key of listKeys) result[key] = (params.get(queryKeys[key]) ?? '').split(',')
  for (const key of ['createdFrom', 'createdTo', 'updatedFrom', 'updatedTo'] as const) result[key] = params.get(queryKeys[key])
  result.hasPhotos = triState(params.get(queryKeys.hasPhotos)); result.hasValidCoordinates = triState(params.get(queryKeys.hasValidCoordinates)); result.inTrip = triState(params.get(queryKeys.inTrip))
  result.isFavorite = triState(params.get(queryKeys.isFavorite))
  const functionalState = params.get(queryKeys.functionalState)
  result.functionalState = functionalState === 'visited' || functionalState === 'non_visited' ? functionalState : null
  result.ratingMin = Number(params.get(queryKeys.ratingMin)) || null
  const sortBy = params.get(queryKeys.sortBy); if (sortBy && ['name', 'created_at', 'updated_at', 'interest_rating', 'visit_rating', 'favorite', 'relevant_rating'].includes(sortBy)) result.sortBy = sortBy as PlaceFilters['sortBy']
  result.sortDirection = params.get(queryKeys.sortDirection) === 'desc' ? 'desc' : 'asc'
  return normalizePlaceFilters(result)
}

export function countActivePlaceFilters(filters: PlaceFilters): number {
  const value = normalizePlaceFilters(filters)
  return Number(Boolean(value.query)) + listKeys.reduce((count, key) => count + Number(value[key].length > 0), 0)
    + ['hasPhotos', 'createdFrom', 'createdTo', 'updatedFrom', 'updatedTo', 'hasValidCoordinates', 'inTrip', 'isFavorite', 'functionalState', 'ratingMin'].reduce((count, key) => count + Number(value[key as keyof PlaceFilters] !== null && value[key as keyof PlaceFilters] !== ''), 0)
    + Number(value.sortBy !== 'name' || value.sortDirection !== 'asc')
}

export const hasActivePlaceFilters = (filters: PlaceFilters) => countActivePlaceFilters(filters) > 0

export function buildPlaceFilterSearchParams(filters: PlaceFilters): URLSearchParams {
  const value = normalizePlaceFilters(filters); const params = new URLSearchParams()
  if (value.query) params.set('q', value.query)
  const backendLists: Array<[keyof PlaceFilters, string]> = [['categoryIds', 'category_ids'], ['tagIds', 'tag_ids'], ['statusIds', 'status_ids'], ['regions', 'regions'], ['accessValues', 'access_values'], ['dangerLevels', 'danger_levels'], ['conditionValues', 'condition_values']]
  for (const [key, parameter] of backendLists) for (const item of value[key] as string[]) params.append(parameter, item)
  const scalar: Array<[keyof PlaceFilters, string]> = [['createdFrom', 'created_from'], ['createdTo', 'created_to'], ['updatedFrom', 'updated_from'], ['updatedTo', 'updated_to']]
  for (const [key, parameter] of scalar) { const item = value[key] as string | null; if (item) params.set(parameter, item) }
  if (value.hasPhotos !== null) params.set('has_photos', String(value.hasPhotos))
  if (value.hasValidCoordinates !== null) params.set('has_valid_coordinates', String(value.hasValidCoordinates))
  if (value.inTrip !== null) params.set('in_trip', String(value.inTrip))
  if (value.isFavorite !== null) params.set('is_favorite', String(value.isFavorite))
  if (value.functionalState !== null) params.set('functional_state', value.functionalState)
  if (value.ratingMin !== null) params.set('rating_min', String(value.ratingMin))
  params.set('sort_by', value.sortBy); params.set('sort_direction', value.sortDirection)
  return params
}
