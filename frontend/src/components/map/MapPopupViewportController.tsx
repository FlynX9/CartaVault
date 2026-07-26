import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

import { calculateHorizontalPopupPan, calculateVerticalPopupPan } from './mapPopupViewport'

interface Props {
  selectedPlaceId: string | null
  tripPlanningActive: boolean
}

const EDGE_GAP = 14
const MAX_POPUP_WIDTH = 672
const MIN_POPUP_WIDTH = 260

export function MapPopupViewportController({ selectedPlaceId, tripPlanningActive }: Props) {
  const map = useMap()

  useEffect(() => {
    const mapContainer = map.getContainer()
    if (!tripPlanningActive || selectedPlaceId === null) {
      mapContainer.style.removeProperty('--cv-trip-popup-width')
      return
    }

    const workspace = mapContainer.closest<HTMLElement>('.map-workspace')
    let firstFrame = 0
    let secondFrame = 0
    let ignoreNextMoveEnd = false

    const placePopup = (attempt = 0) => {
      const panel = workspace?.querySelector<HTMLElement>(
        '.trip-planner-panel:not(.trip-planner-panel--trip-view)',
      )
      const popup = mapContainer.querySelector<HTMLElement>(
        '.leaflet-popup.trip-place-popup:has(.place-map-popup)',
      )
      if (!panel || !popup) return

      const mapBounds = mapContainer.getBoundingClientRect()
      const panelBounds = panel.getBoundingClientRect()
      const scaleX = mapContainer.offsetWidth > 0 ? mapBounds.width / mapContainer.offsetWidth : 1
      const scaleY = mapContainer.offsetHeight > 0 ? mapBounds.height / mapContainer.offsetHeight : 1
      const availableLeft = Math.max(EDGE_GAP, panelBounds.right - mapBounds.left + EDGE_GAP)
      const availableRight = mapBounds.width - EDGE_GAP
      const availableWidth = Math.max(0, availableRight - availableLeft)
      const popupWidth = Math.min(
        MAX_POPUP_WIDTH,
        Math.max(MIN_POPUP_WIDTH, availableWidth / scaleX),
      )

      mapContainer.style.setProperty('--cv-trip-popup-width', `${popupWidth}px`)

      const updatedPopupBounds = popup.getBoundingClientRect()
      const popupLeft = updatedPopupBounds.left - mapBounds.left
      const popupRight = updatedPopupBounds.right - mapBounds.left
      const popupTop = updatedPopupBounds.top - mapBounds.top
      const popupBottom = updatedPopupBounds.bottom - mapBounds.top
      const horizontalPan = calculateHorizontalPopupPan({
        popupLeft,
        popupRight,
        availableLeft,
        availableRight,
      })
      const verticalPan = calculateVerticalPopupPan({
        popupTop,
        popupBottom,
        availableTop: EDGE_GAP,
        availableBottom: mapBounds.height - EDGE_GAP,
      })
      if (Math.abs(horizontalPan) >= 1 || Math.abs(verticalPan) >= 1) {
        ignoreNextMoveEnd = true
        map.panBy([horizontalPan / scaleX, verticalPan / scaleY], { animate: false })
        if (attempt < 3) {
          secondFrame = window.requestAnimationFrame(() => placePopup(attempt + 1))
        }
      }
    }

    const schedulePlacement = () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      firstFrame = window.requestAnimationFrame(placePopup)
    }

    const scheduleAfterExternalMove = () => {
      if (ignoreNextMoveEnd) {
        ignoreNextMoveEnd = false
        return
      }
      schedulePlacement()
    }

    schedulePlacement()
    map.on('popupopen zoomend', schedulePlacement)
    map.on('moveend', scheduleAfterExternalMove)
    const observer = typeof ResizeObserver === 'undefined' || workspace === null
      ? null
      : new ResizeObserver(schedulePlacement)
    if (workspace) observer?.observe(workspace)
    const mutationObserver = new MutationObserver((records) => {
      const popupContentChanged = records.some((record) => Array.from(record.addedNodes).some((node) => (
        node instanceof HTMLElement
        && (node.matches('.place-map-popup') || node.querySelector('.place-map-popup') !== null)
      )))
      if (popupContentChanged) schedulePlacement()
    })
    mutationObserver.observe(mapContainer, { childList: true, subtree: true })
    window.addEventListener('resize', schedulePlacement)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      observer?.disconnect()
      mutationObserver.disconnect()
      map.off('popupopen zoomend', schedulePlacement)
      map.off('moveend', scheduleAfterExternalMove)
      window.removeEventListener('resize', schedulePlacement)
      mapContainer.style.removeProperty('--cv-trip-popup-width')
    }
  }, [map, selectedPlaceId, tripPlanningActive])

  return null
}
