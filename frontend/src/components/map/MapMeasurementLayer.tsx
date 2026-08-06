import { CircleMarker, Polyline, Tooltip, useMapEvents } from 'react-leaflet'

import type { MeasurementPoint } from './measurement'
import { formatMeasurementDistance, measurementSegments } from './measurement'

interface MapMeasurementLayerProps {
  active: boolean
  locale: string
  points: readonly MeasurementPoint[]
  onPointAdd: (point: MeasurementPoint) => void
}

export function MapMeasurementLayer({ active, locale, points, onPointAdd }: MapMeasurementLayerProps) {
  useMapEvents({
    click: (event) => {
      if (!active) return
      onPointAdd({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  const segments = measurementSegments(points)
  const positions = points.map(({ latitude, longitude }) => [latitude, longitude] as [number, number])

  return <>
    {positions.length > 1 && (
      <Polyline
        positions={positions}
        bubblingMouseEvents={false}
        interactive={false}
        pathOptions={{ color: '#0FA68A', opacity: .95, weight: 4, dashArray: '8 7' }}
      />
    )}
    {points.map((point, index) => (
      <CircleMarker
        key={`${point.latitude}:${point.longitude}:${index}`}
        center={[point.latitude, point.longitude]}
        radius={6}
        bubblingMouseEvents={false}
        pathOptions={{ color: '#ffffff', fillColor: '#0FA68A', fillOpacity: 1, weight: 3 }}
      >
        <Tooltip permanent direction="top" offset={[0, -7]} className="measurement-distance-label">
          {index === 0 ? '1' : formatMeasurementDistance(segments[index - 1], locale)}
        </Tooltip>
      </CircleMarker>
    ))}
  </>
}
