import type { PlaceCategory } from '../types/place'
import { getJson } from './client'
import { isRecord, readNullableString, readString, readUuid } from './validation'

function parseCategory(value: unknown): PlaceCategory {
  const context = "La catégorie renvoyée par l'API"
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context),
    name: readString(value, 'name', context),
    description: readNullableString(value, 'description', context),
  }
}

export async function getCategories(signal?: AbortSignal): Promise<PlaceCategory[]> {
  const payload = await getJson('/categories', new URLSearchParams(), signal)
  if (!Array.isArray(payload)) throw new Error("La liste des catégories est invalide.")
  return payload.map(parseCategory)
}
