import { Circle, CircleMarker, Rectangle, Tooltip, useMapEvents } from 'react-leaflet'

import type { InternalMapToolMode } from './mapToolMode'
import type { MapExtent } from './mapExtent'
import { normalizeMapExtent } from './mapExtent'
import type { MeasurementPoint } from './measurement'

interface GeolocationFix extends MeasurementPoint { accuracy: number }

interface MapTemporaryToolsLayerProps {
  mode: InternalMapToolMode
  extent: MapExtent | null
  coordinate: MeasurementPoint | null
  geolocation: GeolocationFix | null
  onExtentChange: (extent: MapExtent) => void
  onCoordinateChange: (point: MeasurementPoint) => void
}

export function MapTemporaryToolsLayer({ mode, extent, coordinate, geolocation, onExtentChange, onCoordinateChange }: MapTemporaryToolsLayerProps) {
  useMapEvents({
    click: (event) => {
      const point = { latitude: event.latlng.lat, longitude: event.latlng.lng }
      if (mode === 'coordinates') { onCoordinateChange(point); return }
      if (mode !== 'area-selection' && mode !== 'extent-drawing') return
      if (extent === null || extent.locked) onExtentChange({ start: point, end: point, locked: false })
      else onExtentChange({ ...extent, end: point, locked: true })
    },
    mousemove: (event) => {
      const point = { latitude: event.latlng.lat, longitude: event.latlng.lng }
      if (mode === 'coordinates') onCoordinateChange(point)
      if ((mode === 'area-selection' || mode === 'extent-drawing') && extent !== null && !extent.locked) {
        onExtentChange({ ...extent, end: point })
      }
    },
  })
  const bounds = extent ? normalizeMapExtent(extent) : null

  return <>
    {bounds && (mode === 'area-selection' || mode === 'extent-drawing') && (
      <Rectangle
        bounds={[[bounds.minLatitude, bounds.minLongitude], [bounds.maxLatitude, bounds.maxLongitude]]}
        interactive={false}
        pathOptions={{ color: mode === 'area-selection' ? '#2563EB' : '#9333EA', fillOpacity: .12, weight: 3, dashArray: extent?.locked ? undefined : '7 6' }}
      />
    )}
    {coordinate && mode === 'coordinates' && (
      <CircleMarker center={[coordinate.latitude, coordinate.longitude]} radius={7} interactive={false} pathOptions={{ color: '#fff', fillColor: '#0FA68A', fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>{coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}</Tooltip>
      </CircleMarker>
    )}
    {geolocation && mode === 'geolocation' && <>
      <Circle center={[geolocation.latitude, geolocation.longitude]} radius={geolocation.accuracy} interactive={false} pathOptions={{ color: '#2563EB', fillColor: '#2563EB', fillOpacity: .1, weight: 2 }} />
      <CircleMarker center={[geolocation.latitude, geolocation.longitude]} radius={7} interactive={false} pathOptions={{ color: '#fff', fillColor: '#2563EB', fillOpacity: 1, weight: 3 }} />
    </>}
  </>
}
