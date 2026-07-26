import { useEffect } from 'react'
import { CircleMarker, MapContainer, useMap } from 'react-leaflet'
import L from 'leaflet'

import { BasemapLayer } from '../map/BasemapLayer'
import { useTheme } from '../../theme/useTheme'
import type { DashboardMapPoint } from '../../types/dashboard'

function FitDashboardPoints({ points }: { points: DashboardMapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]))
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 7, animate: false })
  }, [map, points])
  return null
}

export function DashboardMapPreview({ points, label }: { points: DashboardMapPoint[]; label: string }) {
  const { resolvedTheme } = useTheme()
  return (
    <div className="dashboard-map-wrapper" role="region" aria-label={label}>
      <MapContainer
        className="dashboard-map"
        center={[30, 10]}
        zoom={2}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging
        attributionControl
      >
        <BasemapLayer
          basemapId={resolvedTheme === 'dark' ? 'cartavault-dark' : 'cartavault-light'}
          onTileError={() => undefined}
        />
        {points.map((point) => (
          <CircleMarker
            key={`${point.latitude}:${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={Math.min(12, 4 + Math.log2(point.count + 1))}
            pathOptions={{ color: '#FAFAF8', weight: 1.5, fillColor: '#0FA68A', fillOpacity: 0.82 }}
          />
        ))}
        <FitDashboardPoints points={points} />
      </MapContainer>
    </div>
  )
}
