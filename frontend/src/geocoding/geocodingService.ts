import { coordinateResult, parseCoordinates } from './coordinates'
import { stadiaGeocoder } from './stadiaGeocoder'
import type { Geocoder, GeocodingResult, GeocodingSearchOptions } from './types'

export class GeocodingService {
  private readonly geocoder: Geocoder
  constructor(geocoder: Geocoder = stadiaGeocoder) { this.geocoder = geocoder }
  async search(query: string, options?: GeocodingSearchOptions): Promise<GeocodingResult[]> {
    const normalized = query.trim(); if (!normalized) return []
    const coordinates = parseCoordinates(normalized)
    if (coordinates) return [coordinateResult(coordinates.latitude, coordinates.longitude)]
    const countryResults = await this.geocoder.search(normalized, options)
    if (countryResults.length > 0 || !options?.countryCode) return countryResults
    return this.geocoder.search(normalized, { ...options, countryCode: undefined })
  }
  reverse(latitude: number, longitude: number, options?: GeocodingSearchOptions): Promise<GeocodingResult[]> { return this.geocoder.reverse(latitude, longitude, options) }
}

export const geocodingService = new GeocodingService()
