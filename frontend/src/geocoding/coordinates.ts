import type { GeocodingResult } from './types'

export function isValidLatitude(value: number): boolean { return Number.isFinite(value) && value >= -90 && value <= 90 }
export function isValidLongitude(value: number): boolean { return Number.isFinite(value) && value >= -180 && value <= 180 }

export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const normalized = input.trim().replace(/;/g, ' ')
  if (!normalized) return null
  const decimals = normalized.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*(?:,\s*|\s+)(-?\d+(?:[.,]\d+)?)\s*$/)
  if (!decimals) return null
  const latitude = Number(decimals[1].replace(',', '.')); const longitude = Number(decimals[2].replace(',', '.'))
  return isValidLatitude(latitude) && isValidLongitude(longitude) ? { latitude, longitude } : null
}

export function formatCoordinates(latitude: number, longitude: number): string { return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }

export function coordinateResult(latitude: number, longitude: number): GeocodingResult {
  return { id: `coordinates:${latitude},${longitude}`, name: formatCoordinates(latitude, longitude), formattedAddress: 'Coordonnées saisies', latitude, longitude, source: 'coordinates', layer: 'coordinate' }
}
