import type { PoiMap } from '../../types/map'
import type { MapFocusRequest } from '../../types/place'

const COUNTRY_FOCUS_MAX_ZOOM = 9
const MAX_USABLE_LONGITUDE_SPAN = 180

export function getMapOpeningConfigurationKey(poiMap: PoiMap): string {
  return [
    poiMap.id,
    poiMap.effective_center_latitude,
    poiMap.effective_center_longitude,
    poiMap.effective_default_zoom,
    poiMap.min_latitude,
    poiMap.max_latitude,
    poiMap.min_longitude,
    poiMap.max_longitude,
  ].join(':')
}

export function buildMapOpeningFocusRequest(poiMap: PoiMap, requestId: number): MapFocusRequest {
  const {
    min_latitude: minLatitude,
    max_latitude: maxLatitude,
    min_longitude: minLongitude,
    max_longitude: maxLongitude,
  } = poiMap
  const countryBounds = (
    minLatitude !== null
    && maxLatitude !== null
    && minLongitude !== null
    && maxLongitude !== null
    && maxLongitude - minLongitude < MAX_USABLE_LONGITUDE_SPAN
  ) ? { minLatitude, maxLatitude, minLongitude, maxLongitude } : null

  if (countryBounds !== null) {
    return { id: requestId, bounds: countryBounds, maxZoom: COUNTRY_FOCUS_MAX_ZOOM }
  }

  return {
    id: requestId,
    view: {
      center: [poiMap.effective_center_latitude, poiMap.effective_center_longitude],
      zoom: poiMap.effective_default_zoom,
    },
  }
}
