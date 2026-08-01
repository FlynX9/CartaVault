import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

import type { MapFocusRequest } from '../../types/place'

interface MapFocusControllerProps {
  request: MapFocusRequest | null
}

const PANEL_GAP = 16

interface HorizontalInterval {
  left: number
  right: number
}

interface FitBoundsPadding {
  top: number
  right: number
  bottom: number
  left: number
}

function getFitBoundsPadding(mapContainer: HTMLElement): FitBoundsPadding {
  const padding: FitBoundsPadding = { top: 32, right: 32, bottom: 32, left: 32 }
  const workspace = mapContainer.closest<HTMLElement>('.map-workspace')
  const mapBounds = mapContainer.getBoundingClientRect()
  if (workspace === null || mapBounds.width <= 0 || mapBounds.height <= 0) return padding

  const mapCenterX = mapBounds.left + mapBounds.width / 2
  const mapCenterY = mapBounds.top + mapBounds.height / 2
  const panels = workspace.querySelectorAll<HTMLElement>('.country-place-panel, .map-sidebar, .map-place-detail-overlay')
  for (const panel of panels) {
    const style = window.getComputedStyle(panel)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const bounds = panel.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) continue
    const coversHorizontalCenter = bounds.left <= mapCenterX && bounds.right >= mapCenterX
    const coversVerticalCenter = bounds.top <= mapCenterY && bounds.bottom >= mapCenterY
    const horizontalPanel = bounds.width > bounds.height

    if (horizontalPanel && coversHorizontalCenter) {
      if ((bounds.top + bounds.bottom) / 2 < mapCenterY) {
        padding.top = Math.max(padding.top, bounds.bottom - mapBounds.top + PANEL_GAP)
      } else {
        padding.bottom = Math.max(padding.bottom, mapBounds.bottom - bounds.top + PANEL_GAP)
      }
    } else if (coversVerticalCenter) {
      if ((bounds.left + bounds.right) / 2 < mapCenterX) {
        padding.left = Math.max(padding.left, bounds.right - mapBounds.left + PANEL_GAP)
      } else {
        padding.right = Math.max(padding.right, mapBounds.right - bounds.left + PANEL_GAP)
      }
    }
  }
  return padding
}

function mergeIntervals(intervals: HorizontalInterval[]): HorizontalInterval[] {
  const sorted = intervals.toSorted((first, second) => first.left - second.left)
  const merged: HorizontalInterval[] = []

  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (previous === undefined || interval.left > previous.right) {
      merged.push({ ...interval })
    } else {
      previous.right = Math.max(previous.right, interval.right)
    }
  }

  return merged
}

function getVisibleWorkspacePan(mapContainer: HTMLElement): [number, number] {
  const workspace = mapContainer.closest<HTMLElement>('.map-workspace')
  if (workspace === null) return [0, 0]

  const mapBounds = mapContainer.getBoundingClientRect()
  if (mapBounds.width <= 0 || mapBounds.height <= 0) return [0, 0]

  const occupiedIntervals: HorizontalInterval[] = []
  const panels = workspace.querySelectorAll<HTMLElement>(
    '.country-place-panel, .map-sidebar, .map-place-detail-overlay',
  )

  for (const panel of panels) {
    const style = window.getComputedStyle(panel)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const panelBounds = panel.getBoundingClientRect()
    const isWorkspaceDock = panel.matches('.country-place-panel, .map-sidebar')
    const coversMapCenter = panelBounds.top <= mapBounds.top + mapBounds.height / 2
      && panelBounds.bottom >= mapBounds.top + mapBounds.height / 2
    if ((!isWorkspaceDock && !coversMapCenter) || panelBounds.width <= 0) continue

    const relativeLeft = Math.max(0, panelBounds.left - mapBounds.left - PANEL_GAP)
    const relativeRight = Math.min(
      mapBounds.width,
      panelBounds.right - mapBounds.left + PANEL_GAP,
    )
    if (relativeRight > relativeLeft) {
      occupiedIntervals.push({ left: relativeLeft, right: relativeRight })
    }
  }

  const freeIntervals: HorizontalInterval[] = []
  let freeLeft = 0
  for (const occupied of mergeIntervals(occupiedIntervals)) {
    if (occupied.left > freeLeft) {
      freeIntervals.push({ left: freeLeft, right: occupied.left })
    }
    freeLeft = Math.max(freeLeft, occupied.right)
  }
  if (freeLeft < mapBounds.width) {
    freeIntervals.push({ left: freeLeft, right: mapBounds.width })
  }
  if (freeIntervals.length === 0) return [0, 0]

  const mapCenterX = mapBounds.width / 2
  const visibleInterval = freeIntervals.reduce((best, candidate) => {
    const bestWidth = best.right - best.left
    const candidateWidth = candidate.right - candidate.left
    if (candidateWidth !== bestWidth) return candidateWidth > bestWidth ? candidate : best
    const bestDistance = Math.abs((best.left + best.right) / 2 - mapCenterX)
    const candidateDistance = Math.abs((candidate.left + candidate.right) / 2 - mapCenterX)
    return candidateDistance < bestDistance ? candidate : best
  })
  const visibleCenterX = (visibleInterval.left + visibleInterval.right) / 2
  const scaleX = mapContainer.offsetWidth > 0 ? mapBounds.width / mapContainer.offsetWidth : 1
  return [(mapCenterX - visibleCenterX) / scaleX, 0]
}

export function MapFocusController({ request }: MapFocusControllerProps) {
  const map = useMap()

  useEffect(() => {
    if (request !== null) {
      if (request.bounds) {
        const padding = getFitBoundsPadding(map.getContainer())
        map.fitBounds([
          [request.bounds.minLatitude, request.bounds.minLongitude],
          [request.bounds.maxLatitude, request.bounds.maxLongitude],
        ], {
          paddingTopLeft: [padding.left, padding.top],
          paddingBottomRight: [padding.right, padding.bottom],
          maxZoom: request.maxZoom ?? 15,
        })
      } else {
        map.setView(request.view.center, request.view.zoom, { animate: false })
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
