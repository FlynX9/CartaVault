import { getJson } from './client'
import type { GeocodingResult } from '../geocoding/types'

interface GooglePlacesSearchResponse {
  items: GeocodingResult[]
  available: boolean
  warning_code: string | null
}

export async function searchGooglePlaces(query: string, countryCode?: string, limit = 8, signal?: AbortSignal) {
  const parameters = new URLSearchParams({ q: query, limit: String(limit) })
  if (countryCode) parameters.set('country_code', countryCode)
  return getJson('/account/integrations/google-places/search', parameters, signal) as Promise<GooglePlacesSearchResponse>
}
