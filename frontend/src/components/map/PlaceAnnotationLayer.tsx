import { Circle, Polygon, Polyline } from 'react-leaflet'

import type { PlaceAnnotation } from '../../types/annotation'

function positions(coordinates: GeoJSON.Position[]): [number, number][] {
  return coordinates.map(([longitude, latitude]) => [latitude, longitude])
}

export function PlaceAnnotationLayer({ annotations }: { annotations: PlaceAnnotation[] }) {
  return <>{annotations.map((annotation) => {
    const { geometry, template } = annotation
    const options = { color: template.color, fillColor: template.color, fillOpacity: .15, weight: 3 }
    if (geometry.type === 'Point' && annotation.radius_meters !== null) return <Circle key={annotation.id} center={[geometry.coordinates[1], geometry.coordinates[0]]} radius={annotation.radius_meters} pathOptions={options} />
    if (geometry.type === 'Polygon') return <Polygon key={annotation.id} positions={positions(geometry.coordinates[0])} pathOptions={options} />
    if (geometry.type === 'LineString') return <Polyline key={annotation.id} positions={positions(geometry.coordinates)} pathOptions={options} />
    return null
  })}</>
}
