import type { MapStatusSummary, PlaceStatus, PlaceStatusCreatePayload, PlaceStatusSummary, PlaceStatusUpdatePayload } from '../types/status'
import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readBoolean, readDateTime, readNumber, readString, readUuid } from './validation'

const readFunctionalState = (value: Record<string, unknown>, context: string) => {
  const state = readString(value, 'functional_state', context)
  if (state !== 'non_visited' && state !== 'visited') throw new Error(`${context} contient un état fonctionnel invalide.`)
  return state
}

export function parseStatusSummary(value: unknown): PlaceStatusSummary {
  const context = 'Le statut de suivi renvoyé par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  const color = readString(value, 'color', context)
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error(`${context} contient une couleur invalide.`)
  return {
    id: readUuid(value, 'id', context),
    map_id: readUuid(value, 'map_id', context),
    name: readString(value, 'name', context),
    slug: readString(value, 'slug', context),
    color,
    is_active: readBoolean(value, 'is_active', context),
    functional_state: readFunctionalState(value, context),
  }
}

export function parseMapStatusSummary(value: unknown): MapStatusSummary {
  const context = 'Le statut cartographique renvoyé par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  const color = readString(value, 'color', context)
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error(`${context} contient une couleur invalide.`)
  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
    slug: readString(value, 'slug', context),
    color,
    functional_state: readFunctionalState(value, context),
  }
}

export function parseStatus(value: unknown): PlaceStatus {
  if (!isRecord(value)) throw new Error('Le statut renvoyé par l’API est invalide.')
  return {
    ...parseStatusSummary(value),
    sort_order: readNumber(value, 'sort_order', 'Le statut'),
    is_default: readBoolean(value, 'is_default', 'Le statut'),
    created_at: readDateTime(value, 'created_at', 'Le statut'),
    updated_at: readDateTime(value, 'updated_at', 'Le statut'),
    places_count: readNumber(value, 'places_count', 'Le statut'),
  }
}

export async function getStatuses(mapId: string, signal?: AbortSignal, options: { q?: string; activeOnly?: boolean } = {}): Promise<PlaceStatus[]> {
  const params = new URLSearchParams()
  params.set('map_id', mapId)
  if (options.q?.trim()) params.set('q', options.q.trim())
  if (options.activeOnly) params.set('active_only', 'true')
  const payload = await getJson('/statuses', params, signal)
  if (!Array.isArray(payload)) throw new Error('La liste des statuts est invalide.')
  return payload.map(parseStatus)
}

export async function createStatus(data: PlaceStatusCreatePayload): Promise<PlaceStatus> {
  return parseStatus(await sendJson('/statuses', 'POST', data))
}

export async function updateStatus(id: string, data: PlaceStatusUpdatePayload): Promise<PlaceStatus> {
  return parseStatus(await sendJson(`/statuses/${encodeURIComponent(id)}`, 'PATCH', data))
}

export async function deleteStatus(id: string): Promise<void> {
  await sendWithoutResponse(`/statuses/${encodeURIComponent(id)}`, 'DELETE')
}

export async function reorderStatuses(mapId: string, ids: string[]): Promise<PlaceStatus[]> {
  const params = new URLSearchParams({ map_id: mapId })
  const payload = await sendJson(`/statuses/reorder?${params.toString()}`, 'POST', { ids })
  if (!Array.isArray(payload)) throw new Error('La liste des statuts réordonnée est invalide.')
  return payload.map(parseStatus)
}
