import { coordinateResult, parseCoordinates } from './coordinates'
import { stadiaGeocoder } from './stadiaGeocoder'
import type { Geocoder, GeocodingResult, GeocodingSearchOptions } from './types'

export class GeocodingService {
  private readonly geocoder: Geocoder
  constructor(geocoder: Geocoder = stadiaGeocoder) { this.geocoder = geocoder }
  async search(query: string, options?: GeocodingSearchOptions): Promise<GeocodingResult[]> {
    const normalized = query.trim(); if (!normalized) return []
    const coordinates = parseCoordinates(normalized)
    return coordinates ? [coordinateResult(coordinates.latitude, coordinates.longitude)] : this.geocoder.search(normalized, options)
  }
  reverse(latitude: number, longitude: number, options?: GeocodingSearchOptions): Promise<GeocodingResult[]> { return this.geocoder.reverse(latitude, longitude, options) }
}

export const geocodingService = new GeocodingService()
