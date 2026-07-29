import { getJson } from './client'
import { isRecord, readArray, readDateTime, readNullableNumber, readNumber, readString, readUuid } from './validation'
import type { Country, CountryBoundary } from '../types/map'

const COUNTRY_BOUNDARY_DATA_VERSION = '10m-v2'

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

function parsePosition(value: unknown, context: string): [number, number] {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number') {
    throw new Error(`${context} contient une coordonnée invalide.`)
  }
  return [value[0], value[1]]
}

function parseCountryBoundary(value: unknown): CountryBoundary {
  const context = 'La frontière du pays'
  if (!isRecord(value) || !isRecord(value.geometry) || value.geometry.type !== 'MultiPolygon' || !Array.isArray(value.geometry.coordinates)) {
    throw new Error(`${context} est invalide.`)
  }
  return {
    country_id: readUuid(value, 'country_id', context),
    iso_alpha3: readString(value, 'iso_alpha3', context),
    geometry: {
      type: 'MultiPolygon',
      coordinates: value.geometry.coordinates.map((polygon) => {
        if (!Array.isArray(polygon)) throw new Error(`${context} contient un polygone invalide.`)
        return polygon.map((ring) => {
          if (!Array.isArray(ring)) throw new Error(`${context} contient un anneau invalide.`)
          return ring.map((position) => parsePosition(position, context))
        })
      }),
    },
    point_count: readNumber(value, 'point_count', context),
  }
}

export async function getCountryBoundary(countryId: string, signal?: AbortSignal): Promise<CountryBoundary> {
  return parseCountryBoundary(await getJson(
    `/countries/${encodeURIComponent(countryId)}/boundary`,
    new URLSearchParams({ v: COUNTRY_BOUNDARY_DATA_VERSION }),
    signal,
  ))
}
