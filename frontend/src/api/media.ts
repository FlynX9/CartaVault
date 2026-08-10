import { API_BASE_URL } from '../config'
import type { MediaItem, MediaPage, MediaQuery } from '../types/media'
import { getJson, sendFormData, sendJson, sendWithoutResponse } from './client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseMediaPage(value: unknown): MediaPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('La réponse de la médiathèque est invalide.')
  }
  return value as unknown as MediaPage
}

function parseMediaItem(value: unknown): MediaItem {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Le média reçu est invalide.')
  }
  return value as unknown as MediaItem
}

export async function getMedia(query: MediaQuery, signal: AbortSignal): Promise<MediaPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort_by: query.sortBy,
    sort_direction: query.sortDirection,
  })
  if (query.query.trim()) params.set('q', query.query.trim())
  if (query.mapId) params.set('map_id', query.mapId)
  if (query.countryCode) params.set('country_code', query.countryCode)
  if (query.format) params.set('format', query.format)
  if (query.uploaderId) params.set('uploader_id', query.uploaderId)
  if (query.primary) params.set('is_primary', query.primary)
  if (query.fileState) params.set('file_state', query.fileState)
  if (query.createdFrom) params.set('created_from', query.createdFrom)
  if (query.createdTo) params.set('created_to', query.createdTo)
  if (query.minSize) params.set('min_size', query.minSize)
  if (query.maxSize) params.set('max_size', query.maxSize)
  if (query.minWidth) params.set('min_width', query.minWidth)
  if (query.minHeight) params.set('min_height', query.minHeight)
  return parseMediaPage(await getJson('/media', params, signal))
}

export function getMediaThumbnailUrl(mediaId: string): string {
  return `${API_BASE_URL}/media/${encodeURIComponent(mediaId)}/thumbnail`
}

export function getMediaDownloadUrl(mediaId: string): string {
  return `${API_BASE_URL}/media/${encodeURIComponent(mediaId)}/download`
}

export async function updateMedia(
  mediaId: string,
  payload: { caption?: string | null; taken_at?: string | null },
): Promise<MediaItem> {
  return parseMediaItem(await sendJson(`/media/${encodeURIComponent(mediaId)}`, 'PATCH', payload))
}

export async function setMainMedia(mediaId: string): Promise<MediaItem> {
  return parseMediaItem(await sendJson(`/media/${encodeURIComponent(mediaId)}/set-main`, 'POST', {}))
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await sendWithoutResponse(`/media/${encodeURIComponent(mediaId)}`, 'DELETE')
}

export async function bulkDeleteMedia(mediaIds: string[]): Promise<void> {
  await sendJson('/media/bulk-delete', 'POST', { media_ids: mediaIds })
}

export async function uploadMedia(file: File, mapId: string, coordinates: { latitude: number; longitude: number } | null, takenAt?: string | null, gpsSource?: File | null): Promise<MediaItem> {
  const data = new FormData()
  data.append('file', file)
  data.append('map_id', mapId)
  if (coordinates) { data.append('latitude', String(coordinates.latitude)); data.append('longitude', String(coordinates.longitude)) }
  if (takenAt) data.append('taken_at', takenAt)
  if (!coordinates && gpsSource) data.append('gps_source', gpsSource)
  return parseMediaItem(await sendFormData('/media-actions/upload', 'POST', data))
}

export async function attachMediaToPlace(mediaId: string, placeId: string): Promise<MediaItem> {
  return parseMediaItem(await sendJson(`/media-actions/${encodeURIComponent(mediaId)}/attach-place`, 'POST', { place_id: placeId }))
}
