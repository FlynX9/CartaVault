import { getJson, sendJson, sendWithoutResponse } from './client'
import { isRecord, readArray, readDateTime, readNullableNumber, readNumber, readString, readUuid } from './validation'
import type { CountrySummary, MapCreatePayload, PoiMap } from '../types/map'

function parseCountrySummary(value: unknown): CountrySummary {
  const context = 'Le pays de la carte'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), iso_alpha2: readString(value, 'iso_alpha2', context), iso_alpha3: readString(value, 'iso_alpha3', context), name: readString(value, 'name', context) }
}

export function parseMap(value: unknown): PoiMap {
  const context = 'La carte renvoyée par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context), name: readString(value, 'name', context), country_id: readUuid(value, 'country_id', context),
    country: parseCountrySummary(value.country),
    center_latitude: readNullableNumber(value, 'center_latitude', context), center_longitude: readNullableNumber(value, 'center_longitude', context), default_zoom: readNullableNumber(value, 'default_zoom', context),
    effective_center_latitude: readNumber(value, 'effective_center_latitude', context), effective_center_longitude: readNumber(value, 'effective_center_longitude', context), effective_default_zoom: readNumber(value, 'effective_default_zoom', context),
    min_latitude: readNullableNumber(value, 'min_latitude', context), max_latitude: readNullableNumber(value, 'max_latitude', context), min_longitude: readNullableNumber(value, 'min_longitude', context), max_longitude: readNullableNumber(value, 'max_longitude', context),
    created_at: readDateTime(value, 'created_at', context), updated_at: readDateTime(value, 'updated_at', context),
  }
}

export async function getMaps(signal?: AbortSignal): Promise<PoiMap[]> {
  const payload = await getJson('/maps', new URLSearchParams(), signal)
  return readArray({ items: payload }, 'items', 'La liste des cartes').map(parseMap)
}

export async function createMap(payload: MapCreatePayload): Promise<PoiMap> {
  return parseMap(await sendJson('/maps', 'POST', payload))
}

export async function deleteMap(mapId: string): Promise<void> {
  await sendWithoutResponse(`/maps/${encodeURIComponent(mapId)}`, 'DELETE')
}
