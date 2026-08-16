import type { Geocoder, GeocodingResult } from './types'
import { reverseStadiaPlaces, searchStadiaPlaces } from '../api/stadiaPlaces'

type UnknownRecord = Record<string, unknown>
const stringValue = (value: unknown) => typeof value === 'string' ? value : undefined
const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined

function buildParameters(parameters: Record<string, string | number | undefined>): URLSearchParams {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined && value !== '') search.set(key, String(value))
  return search
}

function parseResult(feature: unknown, index: number): GeocodingResult | null {
  if (feature === null || typeof feature !== 'object') return null
  const record = feature as UnknownRecord; const properties = record.properties
  const geometry = record.geometry
  if (properties === null || typeof properties !== 'object' || geometry === null || typeof geometry !== 'object') return null
  const coordinates = (geometry as UnknownRecord).coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const longitude = numberValue(coordinates[0]); const latitude = numberValue(coordinates[1]); const props = properties as UnknownRecord
  if (latitude === undefined || longitude === undefined) return null
  const bbox = Array.isArray(record.bbox) && record.bbox.length === 4 ? record.bbox.map(numberValue) : null
  const name = stringValue(props.name) ?? stringValue(props.label) ?? 'Résultat géographique'
  return { id: stringValue(props.gid) ?? stringValue(props.id) ?? `stadia:${index}:${latitude}:${longitude}`, name, formattedAddress: stringValue(props.label) ?? stringValue(props.address) ?? name, latitude, longitude, countryCode: stringValue(props.country_code), countryName: stringValue(props.country), region: stringValue(props.region), locality: stringValue(props.locality), postalCode: stringValue(props.postalcode) ?? stringValue(props.postal_code), layer: stringValue(props.layer), source: stringValue(props.source) ?? 'stadia', confidence: numberValue(props.confidence), boundingBox: bbox?.every((value) => value !== undefined) ? { west: bbox[0]!, south: bbox[1]!, east: bbox[2]!, north: bbox[3]! } : undefined }
}

async function request(path: 'search' | 'reverse', parameters: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<GeocodingResult[]> {
  let payload: unknown
  try {
    payload = path === 'search'
      ? await searchStadiaPlaces(buildParameters(parameters), signal)
      : await reverseStadiaPlaces(buildParameters(parameters), signal)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error('Le service de recherche géographique est indisponible.')
  }
  if (payload === null || typeof payload !== 'object' || !Array.isArray((payload as UnknownRecord).features)) throw new Error('La réponse du service géographique est invalide.')
  return ((payload as UnknownRecord).features as unknown[]).map(parseResult).filter((item): item is GeocodingResult => item !== null)
}

export const stadiaGeocoder: Geocoder = {
  search(query, options = {}) { return request('search', { q: query, limit: options.limit ?? 6, focus_lat: options.focus?.[0], focus_lon: options.focus?.[1], country_code: options.countryCode }, options.signal) },
  reverse(latitude, longitude, options = {}) { return request('reverse', { latitude, longitude, limit: options.limit ?? 1 }, options.signal) },
}

export { buildParameters, parseResult }
