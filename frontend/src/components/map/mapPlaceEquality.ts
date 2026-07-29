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
    if (candidate === undefined || place.id !== candidate.id || place.map_id !== candidate.map_id || place.name !== candidate.name || place.latitude !== candidate.latitude || place.longitude !== candidate.longitude || place.is_favorite !== candidate.is_favorite || place.is_visited !== candidate.is_visited || place.interest_rating !== candidate.interest_rating || place.visit_rating !== candidate.visit_rating) return false
    if (place.status.id !== candidate.status.id || place.status.name !== candidate.status.name || place.status.slug !== candidate.status.slug || place.status.color !== candidate.status.color || place.status.functional_state !== candidate.status.functional_state) return false
    if (place.categories.length !== candidate.categories.length || place.tags.length !== candidate.tags.length) return false
    return place.categories.every((category, categoryIndex) => {
      const nextCategory = candidate.categories[categoryIndex]
      return nextCategory !== undefined && category.id === nextCategory.id && category.name === nextCategory.name && category.icon === nextCategory.icon && category.is_primary === nextCategory.is_primary
    }) && place.tags.every((tag, tagIndex) => {
      const nextTag = candidate.tags[tagIndex]
      return nextTag !== undefined && tag.id === nextTag.id && tag.name === nextTag.name && tag.color === nextTag.color
    })
  })
}
