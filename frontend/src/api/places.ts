import type {
  MapCategory,
  MapPlace,
  MapPlaceQuery,
  MapTag,
  PlaceCategory,
  PlaceDetails,
  PlaceTag,
} from '../types/place'
import { getJson } from './client'
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

function parseMapPlace(value: unknown): MapPlace {
  const context = "La réponse cartographique de l'API"

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
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
    description: readNullableString(payload, 'description', context),
    address: readNullableString(payload, 'address', context),
    country: readNullableString(payload, 'country', context),
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
    owner: readNullableString(payload, 'owner', context),
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

  if (query.tagId !== undefined) {
    searchParams.set('tag_id', query.tagId)
  }

  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit))
  }

  const payload = await getJson('/places/map', searchParams, signal)

  return parseMapPlacesResponse(payload)
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
