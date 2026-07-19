import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

import type { MapFocusRequest } from '../../types/place'

interface MapFocusControllerProps {
  request: MapFocusRequest | null
}

export function MapFocusController({ request }: MapFocusControllerProps) {
  const map = useMap()

  useEffect(() => {
    if (request !== null) {
      if (request.bounds) {
        map.fitBounds([
          [request.bounds.minLatitude, request.bounds.minLongitude],
          [request.bounds.maxLatitude, request.bounds.maxLongitude],
        ], { padding: [48, 48], maxZoom: request.maxZoom ?? 15 })
      } else {
        map.setView(request.view.center, request.view.zoom)
      }
    }
  }, [map, request])

  return null
}
