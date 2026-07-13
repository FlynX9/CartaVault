import type { PlaceTag } from '../types/place'
import { getJson } from './client'
import { isRecord, readString, readUuid } from './validation'

function parseTag(value: unknown): PlaceTag {
  const context = "Le tag renvoyé par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), name: readString(value, 'name', context) }
}

export async function getTags(signal?: AbortSignal): Promise<PlaceTag[]> {
  const payload = await getJson('/tags', new URLSearchParams(), signal)
  if (!Array.isArray(payload)) throw new Error("La liste des tags est invalide.")
  return payload.map(parseTag)
}
