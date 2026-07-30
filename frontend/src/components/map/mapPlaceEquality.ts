import type { MapPlace } from '../../types/place'

/**
 * The map API is ordered by name and id.  Retaining the previous array when
 * its marker data is unchanged avoids making Leaflet reconcile thousands of
 * otherwise identical marker components after a bounds refresh.
 */
export function areMapPlacesEqual(previous: readonly MapPlace[], next: readonly MapPlace[]): boolean {
  if (previous === next) return true
  if (previous.length !== next.length) return false

  return previous.every((place, index) => {
    const candidate = next[index]
    if (candidate === undefined || place.id !== candidate.id || place.map_id !== candidate.map_id || place.name !== candidate.name || place.latitude !== candidate.latitude || place.longitude !== candidate.longitude || place.is_favorite !== candidate.is_favorite || place.primary_category_icon !== candidate.primary_category_icon) return false
    if (place.status.id !== candidate.status.id || place.status.color !== candidate.status.color) return false
    if (place.category_ids.length !== candidate.category_ids.length || place.tag_ids.length !== candidate.tag_ids.length) return false
    return place.category_ids.every((id, categoryIndex) => id === candidate.category_ids[categoryIndex])
      && place.tag_ids.every((id, tagIndex) => id === candidate.tag_ids[tagIndex])
  })
}
