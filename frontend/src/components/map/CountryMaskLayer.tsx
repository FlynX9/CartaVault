import { useEffect, useMemo, useState } from 'react'
import type { LatLngExpression } from 'leaflet'
import { Polygon, useMapEvents } from 'react-leaflet'

import { getCountryBoundary } from '../../api/countries'
import type { CountryBoundary, CountryBoundaryDetail } from '../../types/map'

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

function detailForZoom(zoom: number): CountryBoundaryDetail {
  if (zoom >= 8) return 'high'
  if (zoom >= 6) return 'medium'
  return 'low'
}

export function CountryMaskLayer({ countryId, enabled }: CountryMaskLayerProps) {
  const [boundary, setBoundary] = useState<CountryBoundary | null>(null)
  const [detail, setDetail] = useState<CountryBoundaryDetail>('medium')
  const map = useMapEvents({
    zoomend: (event) => setDetail(detailForZoom(event.target.getZoom())),
  })

  useEffect(() => {
    setDetail(detailForZoom(map.getZoom()))
  }, [map])

  useEffect(() => {
    if (!enabled) return
    const attribution = 'Masque &copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>'
    map.attributionControl?.addAttribution(attribution)
    return () => {
      map.attributionControl?.removeAttribution(attribution)
    }
  }, [enabled, map])

  useEffect(() => {
    if (!enabled || countryId === null) {
      setBoundary(null)
      return
    }
    const controller = new AbortController()
    void getCountryBoundary(countryId, detail, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBoundary(value)
      })
      .catch(() => {
        // The mask is decorative: a missing geometry must never block the map.
      })
    return () => controller.abort()
  }, [countryId, detail, enabled])

  const positions = useMemo<LatLngExpression[][] | null>(() => {
    if (boundary === null) return null
    const territories = boundary.geometry.coordinates.flatMap((polygon) => {
      return polygon.map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression))
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
