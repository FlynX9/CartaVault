import type { MapPlace } from '../../types/place'

export interface MapCluster {
  id: string
  latitude: number
  longitude: number
  places: MapPlace[]
}

const CLUSTER_CELL_SIZE = 64

export function clusterMapPlaces(places: MapPlace[], project: (place: MapPlace) => { x: number; y: number }, enabled = true): MapCluster[] {
  if (!enabled) {
    return places.map((place) => ({
      id: place.id,
      latitude: place.latitude,
      longitude: place.longitude,
      places: [place],
    }))
  }

  const buckets = new Map<string, MapPlace[]>()

  for (const place of places) {
    const point = project(place)
    const key = `${Math.floor(point.x / CLUSTER_CELL_SIZE)}:${Math.floor(point.y / CLUSTER_CELL_SIZE)}`
    const bucket = buckets.get(key) ?? []
    bucket.push(place)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()].map(([id, groupedPlaces]) => ({
    id,
    latitude: groupedPlaces.reduce((sum, place) => sum + place.latitude, 0) / groupedPlaces.length,
    longitude: groupedPlaces.reduce((sum, place) => sum + place.longitude, 0) / groupedPlaces.length,
    places: groupedPlaces,
  }))
}
