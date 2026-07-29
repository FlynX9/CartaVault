import { useEffect, useMemo, useState } from 'react'
import type { LatLngExpression } from 'leaflet'
import { Polygon } from 'react-leaflet'

import { getCountryBoundary } from '../../api/countries'
import type { CountryBoundary } from '../../types/map'

const WEB_MERCATOR_LATITUDE_LIMIT = 85.05112878
const WORLD_RING: LatLngExpression[] = [
  [-WEB_MERCATOR_LATITUDE_LIMIT, -180],
  [-WEB_MERCATOR_LATITUDE_LIMIT, 180],
  [WEB_MERCATOR_LATITUDE_LIMIT, 180],
  [WEB_MERCATOR_LATITUDE_LIMIT, -180],
  [-WEB_MERCATOR_LATITUDE_LIMIT, -180],
]

interface CountryMaskLayerProps {
  countryId: string | null
  enabled: boolean
}

export function CountryMaskLayer({ countryId, enabled }: CountryMaskLayerProps) {
  const [boundary, setBoundary] = useState<CountryBoundary | null>(null)

  useEffect(() => {
    setBoundary(null)
    if (!enabled || countryId === null) return
    const controller = new AbortController()
    void getCountryBoundary(countryId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBoundary(value)
      })
      .catch(() => {
        // The mask is decorative: a missing geometry must never block the map.
      })
    return () => controller.abort()
  }, [countryId, enabled])

  const positions = useMemo<LatLngExpression[][] | null>(() => {
    if (boundary === null) return null
    const territories = boundary.geometry.coordinates.flatMap((polygon) => {
      const exteriorRing = polygon[0]
      return exteriorRing
        ? [exteriorRing.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression)]
        : []
    })
    return territories.length > 0 ? [WORLD_RING, ...territories] : null
  }, [boundary])

  if (!enabled || positions === null) return null
  return (
    <Polygon
      positions={positions}
      smoothFactor={0}
      interactive={false}
      bubblingMouseEvents={false}
      pathOptions={{
        className: 'country-outside-mask',
        fill: true,
        fillOpacity: 0.18,
        fillRule: 'evenodd',
        stroke: false,
      }}
    />
  )
}
