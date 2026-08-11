import { describe, expect, it } from 'vitest'

import type { PlaceAnnotation } from '../../types/annotation'
import { annotationCommentPosition, closedShapeLabelPosition } from './PlaceAnnotationLayer'

const annotation = (geometry: GeoJSON.Geometry, radius_meters: number | null = null): PlaceAnnotation => ({ id: 'annotation', place_id: 'place', template_id: 'template', geometry, radius_meters, title: 'Entrée', description: null, template: { id: 'template', map_id: 'map', name: 'Parking', shape_type: 'rectangle', icon: 'tabler:parking', color: '#0fa68a', sort_order: 0, is_active: true, usage_count: 1 } })

describe('closedShapeLabelPosition', () => {
  it('anchors polygon labels at the lower edge of their bounds', () => {
    expect(closedShapeLabelPosition(annotation({ type: 'Polygon', coordinates: [[[2, 48], [4, 48], [3, 50], [2, 48]]] }))).toEqual([48, 3])
  })

  it('anchors circle labels at their southern edge', () => {
    expect(closedShapeLabelPosition(annotation({ type: 'Point', coordinates: [2, 48] }, 111_320))).toEqual([47, 2])
  })

  it('places a polygon comment beside the right edge of the selected shape', () => {
    expect(annotationCommentPosition(annotation({ type: 'Polygon', coordinates: [[[2, 48], [4, 48], [4, 50], [2, 50], [2, 48]]] }))).toEqual([49, 4])
  })
})
