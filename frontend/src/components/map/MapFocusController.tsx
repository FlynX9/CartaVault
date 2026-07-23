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
        const workspace = map.getContainer().closest<HTMLElement>('.map-workspace')
        const leftPanelWidth = workspace?.classList.contains('place-list-open')
          ? workspace.querySelector<HTMLElement>('.country-place-panel')?.getBoundingClientRect().width ?? 0
          : 0
        const rightPanelWidth = workspace?.classList.contains('sidebar-open')
          ? workspace.querySelector<HTMLElement>('.map-sidebar')?.getBoundingClientRect().width ?? 0
          : 0
        map.fitBounds([
          [request.bounds.minLatitude, request.bounds.minLongitude],
          [request.bounds.maxLatitude, request.bounds.maxLongitude],
        ], {
          paddingTopLeft: [leftPanelWidth + 32, 32],
          paddingBottomRight: [rightPanelWidth + 32, 32],
          maxZoom: request.maxZoom ?? 15,
        })
      } else {
        map.setView(request.view.center, request.view.zoom)
      }
    }
  }, [map, request])

  return null
}
