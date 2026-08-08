import { CircleMarker, Polygon, Polyline, useMapEvents } from 'react-leaflet'
import type { AnnotationShapeType } from '../../types/annotation'
import { distanceBetweenPoints, type MeasurementPoint } from './measurement'

export interface AnnotationDrawingState { shapeType: AnnotationShapeType; color: string; points: MeasurementPoint[] }

export function AnnotationDrawingLayer({ drawing, onPointsChange }: { drawing: AnnotationDrawingState | null; onPointsChange: (points: MeasurementPoint[]) => void }) {
  useMapEvents({ click: (event) => {
    if (!drawing) return
    const next = [...drawing.points, { latitude: event.latlng.lat, longitude: event.latlng.lng }]
    const maximum = drawing.shapeType === 'rectangle' || drawing.shapeType === 'circle' || drawing.shapeType === 'line' ? 2 : drawing.shapeType === 'triangle' ? 3 : undefined
    onPointsChange(maximum ? next.slice(0, maximum) : next)
  } })
  if (!drawing) return null
  const positions: [number, number][] = drawing.points.map((point) => [point.latitude, point.longitude])
  const options = { color: drawing.color, fillColor: drawing.color, fillOpacity: .14, weight: 3, dashArray: '7 6' }
  const preview: [number, number][] | null = drawing.shapeType === 'rectangle' && positions.length === 2 ? [[positions[0][0], positions[0][1]], [positions[0][0], positions[1][1]], [positions[1][0], positions[1][1]], [positions[1][0], positions[0][1]]] : drawing.shapeType === 'triangle' && positions.length === 3 ? positions : null
  return <>{positions.map((position, index) => <CircleMarker key={`${position.join(':')}:${index}`} center={position} radius={6} interactive={false} pathOptions={{ color: '#fff', fillColor: drawing.color, fillOpacity: 1, weight: 2 }} />)}{preview && <Polygon positions={preview} interactive={false} pathOptions={options} />}{drawing.shapeType !== 'rectangle' && drawing.shapeType !== 'triangle' && positions.length > 1 && <Polyline positions={positions} interactive={false} pathOptions={options} />}{drawing.shapeType === 'circle' && positions.length === 2 && <CircleMarker center={positions[0]} radius={Math.max(6, Math.min(18, distanceBetweenPoints(drawing.points[0], drawing.points[1]) / 20))} interactive={false} pathOptions={options} />}</>
}
