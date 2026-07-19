import type {
  MapCategory,
  MapPlace,
  MapPlaceResult,
  MapPlaceQuery,
  MapTag,
  PlaceCategory,
  PlaceListQuery,
  PlaceDetails,
  PlaceCreatePayload,
  PlaceUpdatePayload,
  PlaceTag,
  PlaceMapSummary,
  PlaceBulkPayload,
  PlaceBulkResult,
  PlaceBulkTripResult,
  PlaceFacets,
} from '../types/place'
import { buildPlaceFilterSearchParams } from '../places/placeFilters'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { parseMapStatusSummary, parseStatusSummary } from './statuses'
import {
  isRecord,
  readArray,
  readDateTime,
  readNullableNumber,
  readNullableString,
  readNumber,
  readString,
  readUuid,
} from './validation'

function parseNamedEntity(value: unknown, label: string): MapCategory | MapTag {
  const context = `La réponse de l'API pour ${label}`

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
  }
}

function parseMapCategory(value: unknown): MapCategory {
  const category = parseNamedEntity(value, 'la catégorie')
  if (!isRecord(value)) throw new Error("La catégorie cartographique est invalide.")
  return { ...category, icon: readString(value, 'icon', 'La catégorie cartographique'), is_primary: value.is_primary === true }
}

function parsePlaceCategory(value: unknown): PlaceCategory {
  const context = "La catégorie détaillée du POI"

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
    description: readNullableString(value, 'description', context),
    icon: readString(value, 'icon', context),
    is_primary: value.is_primary === true,
  }
}

function parsePlaceTag(value: unknown): PlaceTag {
  return parseNamedEntity(value, 'le tag')
}

function parsePlaceMap(value: unknown): PlaceMapSummary {
  const context = 'La carte du POI'
  if (!isRecord(value) || !isRecord(value.country)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
    country: {
      id: readUuid(value.country, 'id', context),
      iso_alpha2: readString(value.country, 'iso_alpha2', context),
      iso_alpha3: readString(value.country, 'iso_alpha3', context),
      name: readString(value.country, 'name', context),
    },
  }
}

function parseMapPlace(value: unknown): MapPlace {
  const context = "La réponse cartographique de l'API"

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
    map_id: readUuid(value, 'map_id', context),
    name: readString(value, 'name', context),
    longitude: readNumber(value, 'longitude', context),
    latitude: readNumber(value, 'latitude', context),
    status: parseMapStatusSummary(value.status),
    categories: readArray(value, 'categories', context).map(parseMapCategory),
    tags: readArray(value, 'tags', context).map((tag) =>
      parseNamedEntity(tag, 'le tag'),
    ),
  }
}

export function parseMapPlacesResponse(payload: unknown): MapPlace[] {
  if (!Array.isArray(payload)) {
    throw new Error("La réponse cartographique de l'API n'est pas une liste.")
  }

  return payload.map(parseMapPlace)
}

export function parseMapPlacesResult(payload: unknown): MapPlaceResult {
  if (Array.isArray(payload)) return { items: parseMapPlacesResponse(payload), total: payload.length, returned: payload.length, truncated: false }
  const context = "La réponse cartographique de l'API"
  if (!isRecord(payload)) throw new Error(`${context} est invalide.`)
  const items = parseMapPlacesResponse(payload.items)
  const total = readNumber(payload, 'total', context)
  const returned = readNumber(payload, 'returned', context)
  return { items, total, returned, truncated: payload.truncated === true }
}

export function parsePlaceDetailsResponse(payload: unknown): PlaceDetails {
  const context = "La fiche détaillée du POI"

  if (!isRecord(payload)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(payload, 'id', context),
    name: readString(payload, 'name', context),
    map_id: readUuid(payload, 'map_id', context),
    map: parsePlaceMap(payload.map),
    status: parseStatusSummary(payload.status),
    description: readNullableString(payload, 'description', context),
    region: readNullableString(payload, 'region', context),
    construction_date: readNullableString(
      payload,
      'construction_date',
      context,
    ),
    abandonment_date: readNullableString(
      payload,
      'abandonment_date',
      context,
    ),
    condition: readNullableString(payload, 'condition', context),
    access: readNullableString(payload, 'access', context),
    danger_level: readNullableString(payload, 'danger_level', context),
    custom_fields: isRecord(payload.custom_fields) ? payload.custom_fields : {},
    longitude: readNullableNumber(payload, 'longitude', context),
    latitude: readNullableNumber(payload, 'latitude', context),
    categories: readArray(payload, 'categories', context).map(
      parsePlaceCategory,
    ),
    tags: readArray(payload, 'tags', context).map(parsePlaceTag),
    created_at: readDateTime(payload, 'created_at', context),
    updated_at: readDateTime(payload, 'updated_at', context),
  }
}

export function parsePlacesResponse(payload: unknown): PlaceDetails[] {
  if (!Array.isArray(payload)) {
    throw new Error("La réponse de l'API pour les POI n'est pas une liste.")
  }

  return payload.map(parsePlaceDetailsResponse)
}

export async function getMapPlaces(
  query: MapPlaceQuery,
  signal: AbortSignal,
): Promise<MapPlaceResult> {
  const searchParams = buildPlaceFilterSearchParams(query.filters ?? { query: '', categoryIds: [], tagIds: [], statusIds: [], regions: [], hasPhotos: null, createdFrom: null, createdTo: null, updatedFrom: null, updatedTo: null, accessValues: [], dangerLevels: [], conditionValues: [], hasValidCoordinates: null, inTrip: null })
  searchParams.set('min_latitude', String(query.bounds.minLatitude)); searchParams.set('max_latitude', String(query.bounds.maxLatitude)); searchParams.set('min_longitude', String(query.bounds.minLongitude)); searchParams.set('max_longitude', String(query.bounds.maxLongitude))

  if (query.categoryId !== undefined) searchParams.set('category_id', query.categoryId)
  if (query.tagId !== undefined) searchParams.set('tag_id', query.tagId)
  if (query.statusId !== undefined) searchParams.set('status_id', query.statusId)
  if (query.mapId !== undefined) {
    searchParams.set('map_id', query.mapId)
  }

  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit))
  }
  searchParams.set('include_meta', 'true')

  const payload = await getJson('/places/map', searchParams, signal)

  return parseMapPlacesResult(payload)
}

export async function getPlaces(
  query: PlaceListQuery,
  signal?: AbortSignal,
): Promise<PlaceDetails[]> {
  const searchParams = buildPlaceFilterSearchParams(query.filters ?? { query: '', categoryIds: [], tagIds: [], statusIds: [], regions: [], hasPhotos: null, createdFrom: null, createdTo: null, updatedFrom: null, updatedTo: null, accessValues: [], dangerLevels: [], conditionValues: [], hasValidCoordinates: null, inTrip: null })

  if (query.mapId !== undefined) searchParams.set('map_id', query.mapId)
  if (query.q !== undefined) searchParams.set('q', query.q)
  if (query.statusId !== undefined) searchParams.set('status_id', query.statusId)
  if (query.limit !== undefined) searchParams.set('limit', String(query.limit))
  if (query.offset !== undefined) searchParams.set('offset', String(query.offset))

  return parsePlacesResponse(await getJson('/places', searchParams, signal))
}

export async function getPlaceDetails(
  placeId: string,
  signal: AbortSignal,
): Promise<PlaceDetails> {
  const payload = await getJson(
    `/places/${encodeURIComponent(placeId)}`,
    new URLSearchParams(),
    signal,
  )

  return parsePlaceDetailsResponse(payload)
}

export async function createPlace(
  payload: PlaceCreatePayload,
  signal?: AbortSignal,
): Promise<PlaceDetails> {
  return parsePlaceDetailsResponse(
    await sendJson('/places', 'POST', payload, signal),
  )
}

export async function updatePlace(
  placeId: string,
  payload: PlaceUpdatePayload,
  signal?: AbortSignal,
): Promise<PlaceDetails> {
  return parsePlaceDetailsResponse(
    await sendJson(
      `/places/${encodeURIComponent(placeId)}`,
      'PATCH',
      payload,
      signal,
    ),
  )
}

export async function deletePlace(
  placeId: string,
  signal?: AbortSignal,
): Promise<void> {
  await sendWithoutResponse(
    `/places/${encodeURIComponent(placeId)}`,
    'DELETE',
    signal,
  )
}

export async function bulkUpdatePlaces(payload: PlaceBulkPayload, signal?: AbortSignal): Promise<PlaceBulkResult> {
  const value = await sendJson('/places/bulk', 'POST', payload, signal)
  const context = "La réponse d'action groupée"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    selected_count: readNumber(value, 'selected_count', context),
    updated_count: readNumber(value, 'updated_count', context),
    unchanged_count: readNumber(value, 'unchanged_count', context),
    deleted_count: readNumber(value, 'deleted_count', context),
  }
}

export async function getPlaceFacets(mapId: string, filters: import('../types/place').PlaceFilters, signal?: AbortSignal): Promise<PlaceFacets> {
  const params = buildPlaceFilterSearchParams(filters); params.set('map_id', mapId)
  const value = await getJson('/places/facets', params, signal)
  if (!isRecord(value)) throw new Error('Les facettes sont invalides.')
  const list = (key: string) => readArray(value, key, 'Les facettes').map((item) => {
    if (!isRecord(item)) throw new Error('Une facette est invalide.')
    return { id: typeof item.id === 'string' ? item.id : '', name: typeof item.name === 'string' ? item.name : '', value: typeof item.value === 'string' ? item.value : undefined, icon: typeof item.icon === 'string' ? item.icon : undefined, color: typeof item.color === 'string' ? item.color : undefined, count: readNumber(item, 'count', 'Une facette') }
  })
  return { categories: list('categories'), tags: list('tags'), statuses: list('statuses'), regions: list('regions'), access_values: list('access_values'), danger_levels: list('danger_levels'), condition_values: list('condition_values'), with_photos: readNumber(value, 'with_photos', 'Les facettes'), without_photos: readNumber(value, 'without_photos', 'Les facettes'), with_coordinates: readNumber(value, 'with_coordinates', 'Les facettes'), without_coordinates: readNumber(value, 'without_coordinates', 'Les facettes'), in_trip: readNumber(value, 'in_trip', 'Les facettes'), not_in_trip: readNumber(value, 'not_in_trip', 'Les facettes') }
}

export async function bulkAddPlacesToTrip(payload: { place_ids: string[]; trip_id: string; day_id: string }, signal?: AbortSignal): Promise<PlaceBulkTripResult> {
  const value = await sendJson('/places/bulk/add-to-trip', 'POST', payload, signal); const context = "La réponse d'ajout à une sortie"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { selected_count: readNumber(value, 'selected_count', context), added_count: readNumber(value, 'added_count', context), duplicate_count: readNumber(value, 'duplicate_count', context) }
}

async function addAssociation(
  placeId: string,
  kind: 'categories' | 'tags',
  associationId: string,
  signal?: AbortSignal,
): Promise<void> {
  await sendJson(
    `/places/${encodeURIComponent(placeId)}/${kind}/${encodeURIComponent(associationId)}`,
    'POST',
    undefined,
    signal,
  )
}

async function removeAssociation(
  placeId: string,
  kind: 'categories' | 'tags',
  associationId: string,
  signal?: AbortSignal,
): Promise<void> {
  await sendWithoutResponse(
    `/places/${encodeURIComponent(placeId)}/${kind}/${encodeURIComponent(associationId)}`,
    'DELETE',
    signal,
  )
}

export const addPlaceCategory = (
  placeId: string,
  categoryId: string,
  signal?: AbortSignal,
) => addAssociation(placeId, 'categories', categoryId, signal)

export const removePlaceCategory = (
  placeId: string,
  categoryId: string,
  signal?: AbortSignal,
) => removeAssociation(placeId, 'categories', categoryId, signal)

export const setPrimaryPlaceCategory = (placeId: string, categoryId: string, signal?: AbortSignal) => sendJson(`/places/${encodeURIComponent(placeId)}/categories/${encodeURIComponent(categoryId)}`, 'PATCH', { is_primary: true }, signal)

export const addPlaceTag = (
  placeId: string,
  tagId: string,
  signal?: AbortSignal,
) => addAssociation(placeId, 'tags', tagId, signal)

export const removePlaceTag = (
  placeId: string,
  tagId: string,
  signal?: AbortSignal,
) => removeAssociation(placeId, 'tags', tagId, signal)
