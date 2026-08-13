import type { TagCreatePayload, TagRead, TagUpdatePayload } from '../types/admin'
import { normalizeTagColor } from '../tags/tagColors'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readNumber, readString, readUuid } from './validation'
import { isNetworkFailure, offlineTags } from '../pwa/offlineData'

export function parseTag(value: unknown): TagRead {
  const context = "Le tag renvoyé par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), map_id: readUuid(value, 'map_id', context), name: readString(value, 'name', context), color: normalizeTagColor(readString(value, 'color', context)), sort_order: readNumber(value, 'sort_order', context), places_count: readNumber(value, 'places_count', context) }
}

export async function getTags(signal?: AbortSignal, q?: string, mapId?: string | null): Promise<TagRead[]> {
  const searchParams = new URLSearchParams()
  if (mapId) searchParams.set('map_id', mapId)
  if (q !== undefined && q.trim() !== '') searchParams.set('q', q.trim())
  try {
  const payload = await getJson('/tags', searchParams, signal)
  if (!Array.isArray(payload)) throw new Error("La liste des tags est invalide.")
  return payload.map(parseTag)
  } catch (error) {
    if (!isNetworkFailure(error) || !mapId) throw error
    return offlineTags(mapId)
  }
}

export async function getTag(tagId: string, signal?: AbortSignal): Promise<TagRead> {
  const payload = await getJson(
    `/tags/${encodeURIComponent(tagId)}`,
    new URLSearchParams(),
    signal,
  )
  return parseTag(payload)
}

export async function createTag(data: TagCreatePayload, signal?: AbortSignal): Promise<TagRead> {
  return parseTag(await sendJson('/tags', 'POST', data, signal))
}

export async function updateTag(tagId: string, data: TagUpdatePayload, signal?: AbortSignal): Promise<TagRead> {
  return parseTag(await sendJson(`/tags/${encodeURIComponent(tagId)}`, 'PATCH', data, signal))
}

export async function deleteTag(tagId: string, signal?: AbortSignal): Promise<void> {
  await sendWithoutResponse(`/tags/${encodeURIComponent(tagId)}`, 'DELETE', signal)
}

export async function reorderTags(mapId: string, ids: string[], signal?: AbortSignal): Promise<TagRead[]> {
  const payload = await sendJson(`/tags/reorder?${new URLSearchParams({ map_id: mapId })}`, 'POST', { ids }, signal)
  if (!Array.isArray(payload)) throw new Error("L'ordre des tags renvoyé par l'API est invalide.")
  return payload.map(parseTag)
}
