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
      map.setView(request.view.center, request.view.zoom)
    }
  }, [map, request])

  return null
}
