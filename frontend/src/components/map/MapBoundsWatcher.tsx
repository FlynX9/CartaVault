import { useCallback, useEffect, useRef } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'

import type { MapBounds, MapView } from '../../types/place'
import { hasSignificantBoundsChange } from './mapBoundsChange'

interface MapBoundsWatcherProps {
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function readValidBounds(map: LeafletMap): MapBounds | null {
  const bounds = map.getBounds()
  const minLatitude = clamp(bounds.getSouth(), -90, 90)
  const maxLatitude = clamp(bounds.getNorth(), -90, 90)
  const minLongitude = clamp(bounds.getWest(), -180, 180)
  const maxLongitude = clamp(bounds.getEast(), -180, 180)

  if (minLatitude >= maxLatitude || minLongitude >= maxLongitude) {
    return null
  }

  return {
    minLatitude,
    maxLatitude,
    minLongitude,
    maxLongitude,
  }
}

export function MapBoundsWatcher({
  onBoundsChange,
  onViewChange,
}: MapBoundsWatcherProps) {
  const map = useMap()
  const publishedBounds = useRef<MapBounds | null>(null)

  const publishBounds = useCallback(
    (sourceMap: LeafletMap) => {
      const bounds = readValidBounds(sourceMap)

      if (bounds !== null && hasSignificantBoundsChange(publishedBounds.current, bounds)) {
        publishedBounds.current = bounds
        onBoundsChange(bounds)
      }

      const center = sourceMap.getCenter()
      onViewChange({
        center: [center.lat, center.lng],
        zoom: sourceMap.getZoom(),
      })
    },
    [onBoundsChange, onViewChange],
  )

  useEffect(() => {
    publishBounds(map)
  }, [map, publishBounds])

  useMapEvents({
    moveend: () => publishBounds(map),
    zoomend: () => publishBounds(map),
  })

  return null
}
