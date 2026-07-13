import { getJson } from './client'
import { isRecord, readArray, readDateTime, readNullableNumber, readNumber, readString, readUuid } from './validation'
import type { Country } from '../types/map'

function parseCountry(value: unknown): Country {
  const context = 'Le pays renvoyé par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context),
    iso_alpha2: readString(value, 'iso_alpha2', context),
    iso_alpha3: readString(value, 'iso_alpha3', context),
    name: readString(value, 'name', context),
    center_latitude: readNumber(value, 'center_latitude', context),
    center_longitude: readNumber(value, 'center_longitude', context),
    default_zoom: readNumber(value, 'default_zoom', context),
    min_latitude: readNullableNumber(value, 'min_latitude', context),
    max_latitude: readNullableNumber(value, 'max_latitude', context),
    min_longitude: readNullableNumber(value, 'min_longitude', context),
    max_longitude: readNullableNumber(value, 'max_longitude', context),
    created_at: readDateTime(value, 'created_at', context),
    updated_at: readDateTime(value, 'updated_at', context),
  }
}

export async function getCountries(q?: string, signal?: AbortSignal): Promise<Country[]> {
  const params = new URLSearchParams({ limit: '250' })
  if (q) params.set('q', q)
  return readArray({ items: await getJson('/countries', params, signal) }, 'items', 'Le catalogue').map(parseCountry)
}
