import type { TagCreatePayload, TagRead, TagUpdatePayload } from '../types/admin'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readString, readUuid } from './validation'

export function parseTag(value: unknown): TagRead {
  const context = "Le tag renvoyé par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), map_id: readUuid(value, 'map_id', context), name: readString(value, 'name', context) }
}

export async function getTags(signal?: AbortSignal, q?: string, mapId?: string | null): Promise<TagRead[]> {
  const searchParams = new URLSearchParams()
  if (mapId) searchParams.set('map_id', mapId)
  if (q !== undefined && q.trim() !== '') searchParams.set('q', q.trim())
  const payload = await getJson('/tags', searchParams, signal)
  if (!Array.isArray(payload)) throw new Error("La liste des tags est invalide.")
  return payload.map(parseTag)
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
