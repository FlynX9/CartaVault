import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

import type { MapFocusRequest } from '../../types/place'

interface MapFocusControllerProps {
  request: MapFocusRequest | null
}

const PANEL_GAP = 16

function getVisibleWorkspacePan(mapContainer: HTMLElement): [number, number] {
  const workspace = mapContainer.closest<HTMLElement>('.map-workspace')
  if (workspace === null) return [0, 0]

  const mapBounds = mapContainer.getBoundingClientRect()
  if (mapBounds.width <= 0 || mapBounds.height <= 0) return [0, 0]

  let availableLeft = 0
  let availableRight = mapBounds.width
  const panels = [
    workspace.querySelector<HTMLElement>('.country-place-panel'),
    workspace.querySelector<HTMLElement>('.map-sidebar'),
  ]

  for (const panel of panels) {
    if (panel === null || window.getComputedStyle(panel).visibility === 'hidden') continue
    const panelBounds = panel.getBoundingClientRect()
    const coversMapCenter = panelBounds.top <= mapBounds.top + mapBounds.height / 2
      && panelBounds.bottom >= mapBounds.top + mapBounds.height / 2
    if (!coversMapCenter || panelBounds.width <= 0) continue

    const relativeLeft = panelBounds.left - mapBounds.left
    const relativeRight = panelBounds.right - mapBounds.left
    const relativeCenter = (relativeLeft + relativeRight) / 2
    if (relativeCenter < mapBounds.width / 2) {
      availableLeft = Math.max(availableLeft, Math.min(mapBounds.width, relativeRight + PANEL_GAP))
    } else {
      availableRight = Math.min(availableRight, Math.max(0, relativeLeft - PANEL_GAP))
    }
  }

  if (availableRight <= availableLeft) return [0, 0]
  const visibleCenterX = (availableLeft + availableRight) / 2
  const scaleX = mapContainer.offsetWidth > 0 ? mapBounds.width / mapContainer.offsetWidth : 1
  return [(mapBounds.width / 2 - visibleCenterX) / scaleX, 0]
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
        if (request.centerInVisibleWorkspace) {
          const [horizontalPan, verticalPan] = getVisibleWorkspacePan(map.getContainer())
          if (Math.abs(horizontalPan) >= 1 || Math.abs(verticalPan) >= 1) {
            map.panBy([horizontalPan, verticalPan], { animate: false })
          }
        }
      }
    }
  }, [map, request])

  return null
}
