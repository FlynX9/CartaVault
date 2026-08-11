import { Fragment, useEffect, useState } from 'react'
import { DomEvent, divIcon, type LeafletMouseEvent } from 'leaflet'
import { Circle, Marker, Polygon, Polyline, Tooltip } from 'react-leaflet'

import type { PlaceAnnotation } from '../../types/annotation'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

function positions(coordinates: GeoJSON.Position[]): [number, number][] {
  return coordinates.map(([longitude, latitude]) => [latitude, longitude])
}

const annotationLabelAnchor = divIcon({ className: 'place-annotation-label-anchor', iconSize: [0, 0] })

export function closedShapeLabelPosition(annotation: PlaceAnnotation): [number, number] | null {
  const { geometry } = annotation
  if (geometry.type === 'Point' && annotation.radius_meters !== null) return [geometry.coordinates[1] - annotation.radius_meters / 111_320, geometry.coordinates[0]]
  if (geometry.type !== 'Polygon') return null
  const outline = positions(geometry.coordinates[0])
  if (outline.length === 0) return null
  const south = Math.min(...outline.map(([latitude]) => latitude))
  const west = Math.min(...outline.map(([, longitude]) => longitude))
  const east = Math.max(...outline.map(([, longitude]) => longitude))
  return [south, (west + east) / 2]
}

export function annotationCommentPosition(annotation: PlaceAnnotation): [number, number] | null {
  const { geometry } = annotation
  if (geometry.type === 'Point') {
    const latitude = geometry.coordinates[1]
    const radius = annotation.radius_meters ?? 0
    const longitudeOffset = radius / Math.max(1, 111_320 * Math.cos(latitude * Math.PI / 180))
    return [latitude, geometry.coordinates[0] + longitudeOffset]
  }
  if (geometry.type === 'Polygon') {
    const outline = positions(geometry.coordinates[0])
    if (outline.length === 0) return null
    const south = Math.min(...outline.map(([latitude]) => latitude))
    const north = Math.max(...outline.map(([latitude]) => latitude))
    const east = Math.max(...outline.map(([, longitude]) => longitude))
    return [(south + north) / 2, east]
  }
  if (geometry.type === 'LineString') {
    const line = positions(geometry.coordinates)
    return line.length > 0 ? line[Math.floor(line.length / 2)] : null
  }
  return null
}

function AnnotationLabel({ annotation, placement = 'center' }: { annotation: PlaceAnnotation; placement?: 'center' | 'bottom' }) {
  return <Tooltip permanent direction="center" offset={[0, 0]} opacity={1} className={`place-annotation-label${placement === 'bottom' ? ' is-edge-anchored' : ''}`}><span style={{ color: annotation.template.color }}><CategoryIconPreview iconId={annotation.template.icon} size={15} showLabel={false} ariaLabel={annotation.template.name} />{annotation.title && <b>{annotation.title}</b>}</span></Tooltip>
}

function ClosedShapeLabel({ annotation }: { annotation: PlaceAnnotation }) {
  const position = closedShapeLabelPosition(annotation)
  return position ? <Marker position={position} icon={annotationLabelAnchor} interactive={false}><AnnotationLabel annotation={annotation} placement="bottom" /></Marker> : null
}

function AnnotationComment({ annotation }: { annotation: PlaceAnnotation }) {
  const position = annotationCommentPosition(annotation)
  const comment = annotation.description?.trim()
  return position && comment ? <Marker position={position} icon={annotationLabelAnchor} interactive={false}><Tooltip permanent direction="auto" offset={[10, 0]} opacity={1} className="place-annotation-comment"><span>{comment}</span></Tooltip></Marker> : null
}

export function PlaceAnnotationLayer({ annotations }: { annotations: PlaceAnnotation[] }) {
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  useEffect(() => {
    const select = (event: Event) => {
      const detail = (event as CustomEvent<{ placeId?: string; annotationId?: string }>).detail
      if (!detail?.annotationId || !annotations.some((annotation) => annotation.id === detail.annotationId && annotation.place_id === detail.placeId)) return
      setSelectedAnnotationId(detail.annotationId)
    }
    const hover = (event: Event) => {
      const detail = (event as CustomEvent<{ placeId?: string; annotationId?: string | null }>).detail
      const placeId = annotations[0]?.place_id
      if (!placeId || detail?.placeId !== placeId) return
      setHoveredAnnotationId(detail.annotationId && annotations.some((annotation) => annotation.id === detail.annotationId) ? detail.annotationId : null)
    }
    window.addEventListener('cartavault:annotation-selected', select)
    window.addEventListener('cartavault:annotation-hover-changed', hover)
    return () => {
      window.removeEventListener('cartavault:annotation-selected', select)
      window.removeEventListener('cartavault:annotation-hover-changed', hover)
    }
  }, [annotations])
  useEffect(() => {
    if (selectedAnnotationId && !annotations.some((annotation) => annotation.id === selectedAnnotationId)) setSelectedAnnotationId(null)
  }, [annotations, selectedAnnotationId])
  return <>{annotations.map((annotation) => {
    const { geometry, template } = annotation
    const options = { className: 'place-annotation-shape', bubblingMouseEvents: false, color: template.color, fillColor: template.color, fillOpacity: .15, weight: 3 }
    const hovered = hoveredAnnotationId === annotation.id
    const selected = selectedAnnotationId === annotation.id
    const highlighted = hovered || selected
    const haloOptions = { className: `place-annotation-halo${selected ? ' is-selected' : ''}`, bubblingMouseEvents: false, color: template.color, fillColor: template.color, fillOpacity: selected ? .3 : .24, opacity: selected ? .34 : .24, weight: selected ? 12 : 10 }
    const stopMapClick = (event: LeafletMouseEvent) => DomEvent.stop(event.originalEvent)
    const eventHandlers = { mouseover: () => setHoveredAnnotationId(annotation.id), mouseout: () => setHoveredAnnotationId((current) => current === annotation.id ? null : current), click: (event: LeafletMouseEvent) => { stopMapClick(event); window.dispatchEvent(new CustomEvent('cartavault:annotation-selected', { detail: { placeId: annotation.place_id, annotationId: annotation.id } })) } }
    if (geometry.type === 'Point' && annotation.radius_meters !== null) return <Fragment key={annotation.id}>{highlighted && <Circle interactive={false} center={[geometry.coordinates[1], geometry.coordinates[0]]} radius={annotation.radius_meters} pathOptions={haloOptions} />}<Circle center={[geometry.coordinates[1], geometry.coordinates[0]]} radius={annotation.radius_meters} pathOptions={options} eventHandlers={eventHandlers} /><ClosedShapeLabel annotation={annotation} />{selected && <AnnotationComment annotation={annotation} />}</Fragment>
    if (geometry.type === 'Polygon') return <Fragment key={annotation.id}>{highlighted && <Polygon interactive={false} positions={positions(geometry.coordinates[0])} pathOptions={haloOptions} />}<Polygon positions={positions(geometry.coordinates[0])} pathOptions={options} eventHandlers={eventHandlers} /><ClosedShapeLabel annotation={annotation} />{selected && <AnnotationComment annotation={annotation} />}</Fragment>
    if (geometry.type === 'LineString') return <Fragment key={annotation.id}>{highlighted && <Polyline interactive={false} positions={positions(geometry.coordinates)} pathOptions={haloOptions} />}<Polyline positions={positions(geometry.coordinates)} pathOptions={options} eventHandlers={eventHandlers}><AnnotationLabel annotation={annotation} /></Polyline>{selected && <AnnotationComment annotation={annotation} />}</Fragment>
    return null
  })}</>
}
