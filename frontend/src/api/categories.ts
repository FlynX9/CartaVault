import type {
  CategoryCreatePayload,
  CategoryRead,
  CategoryUpdatePayload,
} from '../types/admin'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readNullableString, readNumber, readString, readUuid } from './validation'
import { isNetworkFailure, offlineCategories } from '../pwa/offlineData'

export function parseCategory(value: unknown): CategoryRead {
  const context = "La catégorie renvoyée par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context),
    map_id: readUuid(value, 'map_id', context),
    name: readString(value, 'name', context),
    description: readNullableString(value, 'description', context),
    icon: readString(value, 'icon', context),
    marks_as_visited: value.marks_as_visited === true,
    sort_order: readNumber(value, 'sort_order', context),
    places_count: readNumber(value, 'places_count', context),
  }
}

export async function getCategories(
  signal?: AbortSignal,
  q?: string,
  mapId?: string | null,
): Promise<CategoryRead[]> {
  const searchParams = new URLSearchParams()
  if (mapId) searchParams.set('map_id', mapId)
  if (q !== undefined && q.trim() !== '') searchParams.set('q', q.trim())
  try {
  const payload = await getJson('/categories', searchParams, signal)
  if (!Array.isArray(payload)) throw new Error("La liste des catégories est invalide.")
  return payload.map(parseCategory)
  } catch (error) {
    if (!isNetworkFailure(error) || !mapId) throw error
    return offlineCategories(mapId)
  }
}

export async function getCategory(
  categoryId: string,
  signal?: AbortSignal,
): Promise<CategoryRead> {
  const payload = await getJson(
    `/categories/${encodeURIComponent(categoryId)}`,
    new URLSearchParams(),
    signal,
  )
  return parseCategory(payload)
}

export async function createCategory(
  data: CategoryCreatePayload,
  signal?: AbortSignal,
): Promise<CategoryRead> {
  return parseCategory(await sendJson('/categories', 'POST', data, signal))
}

export async function updateCategory(
  categoryId: string,
  data: CategoryUpdatePayload,
  signal?: AbortSignal,
): Promise<CategoryRead> {
  return parseCategory(await sendJson(`/categories/${encodeURIComponent(categoryId)}`, 'PATCH', data, signal))
}

export async function deleteCategory(categoryId: string, signal?: AbortSignal): Promise<void> {
  await sendWithoutResponse(`/categories/${encodeURIComponent(categoryId)}`, 'DELETE', signal)
}

export async function reorderCategories(mapId: string, ids: string[], signal?: AbortSignal): Promise<CategoryRead[]> {
  const payload = await sendJson(`/categories/reorder?${new URLSearchParams({ map_id: mapId })}`, 'POST', { ids }, signal)
  if (!Array.isArray(payload)) throw new Error("L'ordre des catégories renvoyé par l'API est invalide.")
  return payload.map(parseCategory)
}
