export interface MeasurementPoint {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_METERS = 6_371_008.8

function toRadians(value: number): number {
  return value * Math.PI / 180
}

export function distanceBetweenPoints(start: MeasurementPoint, end: MeasurementPoint): number {
  const latitudeDelta = toRadians(end.latitude - start.latitude)
  const longitudeDelta = toRadians(end.longitude - start.longitude)
  const startLatitude = toRadians(start.latitude)
  const endLatitude = toRadians(end.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

export function measurementSegments(points: readonly MeasurementPoint[]): number[] {
  return points.slice(1).map((point, index) => distanceBetweenPoints(points[index], point))
}

export function measurementTotal(points: readonly MeasurementPoint[]): number {
  return measurementSegments(points).reduce((total, distance) => total + distance, 0)
}

export function formatMeasurementDistance(distanceInMeters: number, locale: string): string {
  if (distanceInMeters < 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceInMeters)} m`
  }
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(distanceInMeters / 1_000)} km`
}
