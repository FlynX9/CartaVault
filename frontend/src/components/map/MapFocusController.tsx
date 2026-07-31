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
