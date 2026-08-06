import type { MeasurementPoint } from './measurement'
import { distanceBetweenPoints } from './measurement'

export interface MapExtent {
  start: MeasurementPoint
  end: MeasurementPoint
  locked: boolean
}

export interface NormalizedMapExtent {
  minLatitude: number
  maxLatitude: number
  minLongitude: number
  maxLongitude: number
}

export function normalizeMapExtent(extent: MapExtent): NormalizedMapExtent {
  return {
    minLatitude: Math.min(extent.start.latitude, extent.end.latitude),
    maxLatitude: Math.max(extent.start.latitude, extent.end.latitude),
    minLongitude: Math.min(extent.start.longitude, extent.end.longitude),
    maxLongitude: Math.max(extent.start.longitude, extent.end.longitude),
  }
}

export function pointIsInsideExtent(point: MeasurementPoint, extent: MapExtent): boolean {
  const bounds = normalizeMapExtent(extent)
  return point.latitude >= bounds.minLatitude && point.latitude <= bounds.maxLatitude
    && point.longitude >= bounds.minLongitude && point.longitude <= bounds.maxLongitude
}

export function mapExtentArea(extent: MapExtent): number {
  const { width, height } = mapExtentDimensions(extent)
  return width * height
}

export function mapExtentDimensions(extent: MapExtent): { width: number; height: number; perimeter: number } {
  const bounds = normalizeMapExtent(extent)
  const middleLatitude = (bounds.minLatitude + bounds.maxLatitude) / 2
  const width = distanceBetweenPoints(
    { latitude: middleLatitude, longitude: bounds.minLongitude },
    { latitude: middleLatitude, longitude: bounds.maxLongitude },
  )
  const height = distanceBetweenPoints(
    { latitude: bounds.minLatitude, longitude: bounds.minLongitude },
    { latitude: bounds.maxLatitude, longitude: bounds.minLongitude },
  )
  return { width, height, perimeter: 2 * (width + height) }
}

export function mapExtentGeoJson(extent: MapExtent): string {
  const bounds = normalizeMapExtent(extent)
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      [bounds.minLongitude, bounds.minLatitude],
      [bounds.maxLongitude, bounds.minLatitude],
      [bounds.maxLongitude, bounds.maxLatitude],
      [bounds.minLongitude, bounds.maxLatitude],
      [bounds.minLongitude, bounds.minLatitude],
    ]],
  })
}

export function formatMapArea(squareMeters: number, locale: string): string {
  if (squareMeters < 1_000_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(squareMeters)} m²`
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(squareMeters / 1_000_000)} km²`
}
