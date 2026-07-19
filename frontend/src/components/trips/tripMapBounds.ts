import type { MapBounds } from '../../types/place'
import type { Trip } from '../../types/trip'

type Coordinate = { latitude: number; longitude: number }

function isValidCoordinate({ latitude, longitude }: Coordinate): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

export function getTripMapBounds(trip: Trip | null): MapBounds | null {
  if (trip === null) return null

  const coordinates: Coordinate[] = []
  const add = (coordinate: Coordinate | null | undefined) => {
    if (coordinate && isValidCoordinate(coordinate)) coordinates.push(coordinate)
  }

  add(trip.departure)
  add(trip.arrival)
  trip.nights.forEach(add)
  trip.days.forEach((day) => {
    day.stops.forEach(add)
    day.route_geometry?.coordinates.forEach(([longitude, latitude]) => add({ latitude, longitude }))
  })

  if (coordinates.length === 0) return null
  return coordinates.reduce<MapBounds>((bounds, coordinate) => ({
    minLatitude: Math.min(bounds.minLatitude, coordinate.latitude),
    maxLatitude: Math.max(bounds.maxLatitude, coordinate.latitude),
    minLongitude: Math.min(bounds.minLongitude, coordinate.longitude),
    maxLongitude: Math.max(bounds.maxLongitude, coordinate.longitude),
  }), {
    minLatitude: coordinates[0].latitude,
    maxLatitude: coordinates[0].latitude,
    minLongitude: coordinates[0].longitude,
    maxLongitude: coordinates[0].longitude,
  })
}
