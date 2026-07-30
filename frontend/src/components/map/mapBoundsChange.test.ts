import { describe, expect, it } from 'vitest'

import type { MapBounds } from '../../types/place'
import { hasSignificantBoundsChange } from './mapBoundsChange'

const bounds: MapBounds = {
  minLatitude: 40,
  maxLatitude: 50,
  minLongitude: -5,
  maxLongitude: 5,
}

describe('hasSignificantBoundsChange', () => {
  it('publishes the initial bounds and ignores duplicate events', () => {
    expect(hasSignificantBoundsChange(null, bounds)).toBe(true)
    expect(hasSignificantBoundsChange(bounds, { ...bounds })).toBe(false)
  })

  it('ignores an insignificant pan but publishes accumulated movement', () => {
    expect(hasSignificantBoundsChange(bounds, {
      minLatitude: 40.3,
      maxLatitude: 50.3,
      minLongitude: -4.7,
      maxLongitude: 5.3,
    })).toBe(false)
    expect(hasSignificantBoundsChange(bounds, {
      minLatitude: 40.7,
      maxLatitude: 50.7,
      minLongitude: -4.3,
      maxLongitude: 5.7,
    })).toBe(true)
  })

  it('publishes meaningful zoom changes', () => {
    expect(hasSignificantBoundsChange(bounds, {
      minLatitude: 41,
      maxLatitude: 49,
      minLongitude: -4,
      maxLongitude: 4,
    })).toBe(true)
  })
})
