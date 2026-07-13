import type {
  MapCategory,
  MapPlace,
  MapPlaceQuery,
  MapTag,
} from '../types/place'
import { getJson } from './client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNamedEntity(value: unknown, label: string): MapCategory | MapTag {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string'
  ) {
    throw new Error(`La réponse de l'API contient un ${label} invalide.`)
  }

  return {
    id: value.id,
    name: value.name,
  }
}

function parseMapPlace(value: unknown): MapPlace {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.longitude !== 'number' ||
    typeof value.latitude !== 'number' ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.tags)
  ) {
    throw new Error("La réponse cartographique de l'API est invalide.")
  }

  return {
    id: value.id,
    name: value.name,
    longitude: value.longitude,
    latitude: value.latitude,
    categories: value.categories.map((category) =>
      parseNamedEntity(category, 'catégorie'),
    ),
    tags: value.tags.map((tag) => parseNamedEntity(tag, 'tag')),
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

  if (!Array.isArray(payload)) {
    throw new Error("La réponse cartographique de l'API n'est pas une liste.")
  }

  return payload.map(parseMapPlace)
}
