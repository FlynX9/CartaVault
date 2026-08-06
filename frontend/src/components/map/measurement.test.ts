import { describe, expect, it } from 'vitest'

import { distanceBetweenPoints, formatMeasurementDistance, measurementSegments, measurementTotal } from './measurement'

describe('map measurement calculations', () => {
  const paris = { latitude: 48.8566, longitude: 2.3522 }
  const versailles = { latitude: 48.8014, longitude: 2.1301 }
  const saintGermain = { latitude: 48.8989, longitude: 2.0938 }

  it('calculates every segment and their cumulative distance', () => {
    const segments = measurementSegments([paris, versailles, saintGermain])

    expect(segments).toHaveLength(2)
    expect(segments[0]).toBeCloseTo(distanceBetweenPoints(paris, versailles), 6)
    expect(measurementTotal([paris, versailles, saintGermain])).toBeCloseTo(segments[0] + segments[1], 6)
  })

  it('returns zero when fewer than two points exist', () => {
    expect(measurementTotal([])).toBe(0)
    expect(measurementTotal([paris])).toBe(0)
  })

  it('formats short and long distances using the active locale', () => {
    expect(formatMeasurementDistance(425.4, 'fr')).toBe('425 m')
    expect(formatMeasurementDistance(12_345, 'fr')).toBe('12,35 km')
    expect(formatMeasurementDistance(12_345, 'en')).toBe('12.35 km')
  })
})
