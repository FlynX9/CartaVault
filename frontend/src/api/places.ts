import type {
  MapCategory,
  MapPlace,
  MapPlaceQuery,
  MapTag,
  PlaceCategory,
  PlaceListQuery,
  PlaceDetails,
  PlaceCreatePayload,
  PlaceUpdatePayload,
  PlaceTag,
  PlaceMapSummary,
} from '../types/place'
import { getJson, sendJson, sendWithoutResponse } from './client'
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

function parsePlaceCategory(value: unknown): PlaceCategory {
  const context = "La catégorie détaillée du POI"

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
    description: readNullableString(value, 'description', context),
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
    categories: readArray(value, 'categories', context).map((category) =>
      parseNamedEntity(category, 'la catégorie'),
    ),
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
): Promise<MapPlace[]> {
  const searchParams = new URLSearchParams({
    min_latitude: String(query.bounds.minLatitude),
    max_latitude: String(query.bounds.maxLatitude),
    min_longitude: String(query.bounds.minLongitude),
    max_longitude: String(query.bounds.maxLongitude),
  })

  if (query.categoryId !== undefined) {
    searchParams.set('category_id', query.categoryId)
  }

  if (query.mapId !== undefined) {
    searchParams.set('map_id', query.mapId)
  }

  if (query.tagId !== undefined) {
    searchParams.set('tag_id', query.tagId)
  }

  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit))
  }

  const payload = await getJson('/places/map', searchParams, signal)

  return parseMapPlacesResponse(payload)
}

export async function getPlaces(
  query: PlaceListQuery,
  signal?: AbortSignal,
): Promise<PlaceDetails[]> {
  const searchParams = new URLSearchParams()

  if (query.mapId !== undefined) searchParams.set('map_id', query.mapId)
  if (query.q !== undefined) searchParams.set('q', query.q)
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
