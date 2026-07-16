import type {
  CategoryCreatePayload,
  CategoryRead,
  CategoryUpdatePayload,
} from '../types/admin'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readNullableString, readString, readUuid } from './validation'

export function parseCategory(value: unknown): CategoryRead {
  const context = "La catégorie renvoyée par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context),
    map_id: readUuid(value, 'map_id', context),
    name: readString(value, 'name', context),
    description: readNullableString(value, 'description', context),
    icon: readString(value, 'icon', context),
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
  const payload = await getJson('/categories', searchParams, signal)
  if (!Array.isArray(payload)) throw new Error("La liste des catégories est invalide.")
  return payload.map(parseCategory)
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
