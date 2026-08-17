import type { OfflinePackage } from './offlineData'

export interface OfflinePackageInventory {
  places: number
  categories: number
  tags: number
  statuses: number
  thumbnails: number
  annotations: number
  days: number
  stops: number
  nights: number
  routes: number
  tiles: number
}

export function getOfflinePackageInventory(item: OfflinePackage): OfflinePackageInventory {
  const trip = item.snapshot.trip
  return {
    places: item.snapshot.places?.length ?? 0,
    categories: item.snapshot.categories?.length ?? 0,
    tags: item.snapshot.tags?.length ?? 0,
    statuses: item.snapshot.statuses?.length ?? 0,
    thumbnails: Object.keys(item.snapshot.thumbnails ?? {}).length,
    annotations: Object.values(item.snapshot.annotations ?? {}).flat().length,
    days: trip?.days?.length ?? 0,
    stops: trip?.days?.reduce((total, day) => total + (day.stops?.length ?? 0), 0) ?? 0,
    nights: trip?.nights?.length ?? 0,
    routes: trip?.days?.filter((day) => day.route_geometry !== null).length ?? 0,
    tiles: item.basemap?.tileKeys?.length ?? 0,
  }
}
