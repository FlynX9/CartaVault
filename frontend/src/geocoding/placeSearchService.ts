import { searchGooglePlaces } from '../api/googlePlaces'
import { coordinateResult, parseCoordinates } from './coordinates'
import { geocodingService } from './geocodingService'
import type { GeocodingResult, GeocodingSearchOptions } from './types'

function normalizedText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function addressNumbers(value: string) {
  return normalizedText(value).split(' ').filter((token) => /^\d+$/.test(token))
}

export function isRelevantPlaceResult(result: GeocodingResult, query: string, countryCode?: string) {
  const expectedNumbers = addressNumbers(query)
  const candidateTokens = normalizedText(`${result.formattedAddress} ${result.postalCode ?? ''}`).split(' ')
  const numbersMatch = expectedNumbers.length === 0 || expectedNumbers.every((number) => candidateTokens.includes(number))
  const countryMatches = !countryCode || !result.countryCode || result.countryCode.toUpperCase() === countryCode.toUpperCase()
  return numbersMatch && countryMatches
}

export class PlaceSearchService {
  async search(query: string, options: GeocodingSearchOptions = {}): Promise<GeocodingResult[]> {
    const normalized = query.trim()
    if (!normalized) return []
    const coordinates = parseCoordinates(normalized)
    if (coordinates) return [coordinateResult(coordinates.latitude, coordinates.longitude)]

    const google = await searchGooglePlaces(normalized, options.countryCode, options.limit ?? 6, options.signal)
    if (google.available) return google.items.filter((result) => isRelevantPlaceResult(result, normalized, options.countryCode))
    if (google.warning_code !== 'GOOGLE_PLACES_NOT_SELECTED') {
      throw new Error('Google Places est sélectionné mais sa clé n’est pas disponible ou vérifiée.')
    }

    const stadia = await geocodingService.search(normalized, options)
    return stadia.filter((result) => isRelevantPlaceResult(result, normalized, options.countryCode))
  }
}

export const placeSearchService = new PlaceSearchService()
