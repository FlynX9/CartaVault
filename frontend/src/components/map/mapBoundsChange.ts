import type { MapBounds } from '../../types/place'

const SIGNIFICANT_BOUNDS_CHANGE_RATIO = 0.06

function center(minimum: number, maximum: number) {
  return minimum + (maximum - minimum) / 2
}

/**
 * Ignores Leaflet's duplicate moveend/zoomend notifications and tiny floating
 * point changes. The comparison stays relative to the last published bounds,
 * so several small pans still accumulate into a refresh.
 */
export function hasSignificantBoundsChange(
  previous: MapBounds | null,
  next: MapBounds,
): boolean {
  if (previous === null) return true

  const previousLatitudeSpan = previous.maxLatitude - previous.minLatitude
  const previousLongitudeSpan = previous.maxLongitude - previous.minLongitude
  const nextLatitudeSpan = next.maxLatitude - next.minLatitude
  const nextLongitudeSpan = next.maxLongitude - next.minLongitude
  const latitudeScale = Math.max(previousLatitudeSpan, nextLatitudeSpan, Number.EPSILON)
  const longitudeScale = Math.max(previousLongitudeSpan, nextLongitudeSpan, Number.EPSILON)

  return (
    Math.abs(nextLatitudeSpan - previousLatitudeSpan) / latitudeScale >= SIGNIFICANT_BOUNDS_CHANGE_RATIO
    || Math.abs(nextLongitudeSpan - previousLongitudeSpan) / longitudeScale >= SIGNIFICANT_BOUNDS_CHANGE_RATIO
    || Math.abs(center(next.minLatitude, next.maxLatitude) - center(previous.minLatitude, previous.maxLatitude)) / latitudeScale >= SIGNIFICANT_BOUNDS_CHANGE_RATIO
    || Math.abs(center(next.minLongitude, next.maxLongitude) - center(previous.minLongitude, previous.maxLongitude)) / longitudeScale >= SIGNIFICANT_BOUNDS_CHANGE_RATIO
  )
}
