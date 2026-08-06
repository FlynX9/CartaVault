import { describe, expect, it } from 'vitest'

import { formatMapArea, mapExtentArea, mapExtentDimensions, mapExtentGeoJson, normalizeMapExtent, pointIsInsideExtent, type MapExtent } from './mapExtent'

const extent: MapExtent = {
  start: { latitude: 49, longitude: 3 },
  end: { latitude: 47, longitude: 1 },
  locked: true,
}

describe('temporary map extents', () => {
  it('normalizes reverse drawing directions', () => {
    expect(normalizeMapExtent(extent)).toEqual({ minLatitude: 47, maxLatitude: 49, minLongitude: 1, maxLongitude: 3 })
  })

  it('includes boundary points and excludes outside places', () => {
    expect(pointIsInsideExtent({ latitude: 48, longitude: 2 }, extent)).toBe(true)
    expect(pointIsInsideExtent({ latitude: 49, longitude: 3 }, extent)).toBe(true)
    expect(pointIsInsideExtent({ latitude: 50, longitude: 2 }, extent)).toBe(false)
  })

  it('computes and formats a positive optional area', () => {
    expect(mapExtentArea(extent)).toBeGreaterThan(1_000_000)
    expect(formatMapArea(1_250_000, 'fr')).toBe('1,25 km²')
  })

  it('reports dimensions and perimeter independently from place selection', () => {
    const dimensions = mapExtentDimensions(extent)
    expect(dimensions.width).toBeGreaterThan(0)
    expect(dimensions.height).toBeGreaterThan(0)
    expect(dimensions.perimeter).toBeCloseTo(2 * (dimensions.width + dimensions.height))
  })

  it('exports the extent as a closed GeoJSON polygon', () => {
    expect(JSON.parse(mapExtentGeoJson(extent))).toEqual({
      type: 'Polygon',
      coordinates: [[[1, 47], [3, 47], [3, 49], [1, 49], [1, 47]]],
    })
  })
})
