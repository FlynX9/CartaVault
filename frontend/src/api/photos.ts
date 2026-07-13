import { API_BASE_URL } from '../config'
import type { Photo } from '../types/photo'
import { getJson } from './client'
import {
  isRecord,
  readNullableDate,
  readNullableDateTime,
  readNullableString,
  readNullableUuid,
  readString,
  readUuid,
} from './validation'

function parsePhoto(value: unknown): Photo {
  const context = "La métadonnée photo du POI"

  if (!isRecord(value)) {
    throw new Error(`${context} est invalide.`)
  }

  return {
    id: readUuid(value, 'id', context),
    place_id: readNullableUuid(value, 'place_id', context),
    filename: readString(value, 'filename', context),
    original_name: readNullableString(value, 'original_name', context),
    path: readNullableString(value, 'path', context),
    description: readNullableString(value, 'description', context),
    taken_at: readNullableDate(value, 'taken_at', context),
    created_at: readNullableDateTime(value, 'created_at', context),
  }
}

export function parsePhotosResponse(payload: unknown): Photo[] {
  if (!Array.isArray(payload)) {
    throw new Error("La réponse des photos de l'API n'est pas une liste.")
  }

  return payload.map(parsePhoto)
}

export async function getPlacePhotos(
  placeId: string,
  signal: AbortSignal,
): Promise<Photo[]> {
  const payload = await getJson(
    `/places/${encodeURIComponent(placeId)}/photos`,
    new URLSearchParams(),
    signal,
  )

  return parsePhotosResponse(payload)
}

export function getPhotoFileUrl(photoId: string): string {
  return `${API_BASE_URL}/photos/${encodeURIComponent(photoId)}/file`
}
