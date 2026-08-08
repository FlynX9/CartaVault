import { useEffect, useRef } from 'react'
import { Circle, CircleMarker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'

import type { AnnotationShapeType } from '../../types/annotation'
import { distanceBetweenPoints, type MeasurementPoint } from './measurement'

export interface AnnotationDrawingState { shapeType: AnnotationShapeType; color: string; points: MeasurementPoint[] }

function pointFromEvent(event: { latlng: { lat: number; lng: number } }): MeasurementPoint {
  return { latitude: event.latlng.lat, longitude: event.latlng.lng }
}

function triangleFromBounds(start: MeasurementPoint, end: MeasurementPoint): MeasurementPoint[] {
  return [start, { latitude: start.latitude, longitude: end.longitude }, { latitude: end.latitude, longitude: (start.longitude + end.longitude) / 2 }]
}

export function AnnotationDrawingLayer({ drawing, onPointsChange, onComplete }: { drawing: AnnotationDrawingState | null; onPointsChange: (points: MeasurementPoint[]) => void; onComplete: (points: MeasurementPoint[]) => void }) {
  const map = useMap()
  const dragging = useRef(false)
  const start = useRef<MeasurementPoint | null>(null)

  useEffect(() => {
    if (!drawing) return
    map.dragging.disable()
    return () => { map.dragging.enable() }
  }, [drawing, map])

  useMapEvents({
    mousedown: (event) => {
      if (!drawing) return
      const point = pointFromEvent(event)
      dragging.current = true
      start.current = point
      onPointsChange([point])
    },
    mousemove: (event) => {
      if (!drawing || !dragging.current || !start.current) return
      const end = pointFromEvent(event)
      if (drawing.shapeType === 'path') {
        const current = drawing.points
        const last = current[current.length - 1]
        if (!last || distanceBetweenPoints(last, end) >= 4) onPointsChange([...current, end])
        return
      }
      const next = drawing.shapeType === 'triangle' ? triangleFromBounds(start.current, end) : [start.current, end]
      onPointsChange(next)
    },
    mouseup: (event) => {
      if (!drawing || !dragging.current || !start.current) return
      dragging.current = false
      const end = pointFromEvent(event)
      let next: MeasurementPoint[]
      if (drawing.shapeType === 'path') {
        const last = drawing.points[drawing.points.length - 1]
        next = !last || distanceBetweenPoints(last, end) >= 1 ? [...drawing.points, end] : drawing.points
      } else {
        next = drawing.shapeType === 'triangle' ? triangleFromBounds(start.current, end) : [start.current, end]
      }
      start.current = null
      onPointsChange(next)
      if (next.length >= 2) onComplete(next)
    },
  })

  if (!drawing) return null
  const positions: [number, number][] = drawing.points.map((point) => [point.latitude, point.longitude])
  const options = { color: drawing.color, fillColor: drawing.color, fillOpacity: .14, weight: 3, dashArray: '7 6' }
  const preview: [number, number][] | null = drawing.shapeType === 'rectangle' && positions.length === 2
    ? [[positions[0][0], positions[0][1]], [positions[0][0], positions[1][1]], [positions[1][0], positions[1][1]], [positions[1][0], positions[0][1]]]
    : drawing.shapeType === 'triangle' && positions.length === 3 ? positions : null

  return <>{positions.map((position, index) => <CircleMarker key={`${position.join(':')}:${index}`} center={position} radius={6} interactive={false} pathOptions={{ color: '#fff', fillColor: drawing.color, fillOpacity: 1, weight: 2 }} />)}
    {preview && <Polygon positions={preview} interactive={false} pathOptions={options} />}
    {drawing.shapeType !== 'rectangle' && drawing.shapeType !== 'triangle' && drawing.shapeType !== 'circle' && positions.length > 1 && <Polyline positions={positions} interactive={false} pathOptions={options} />}
    {drawing.shapeType === 'circle' && positions.length === 2 && <Circle center={positions[0]} radius={distanceBetweenPoints(drawing.points[0], drawing.points[1])} interactive={false} pathOptions={options} />}
  </>
}
