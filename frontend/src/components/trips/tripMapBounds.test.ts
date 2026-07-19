import { describe, expect, it } from 'vitest'

import type { Trip } from '../../types/trip'
import { getTripMapBounds } from './tripMapBounds'

describe('getTripMapBounds', () => {
  it('includes departure, arrival, nights, stops and every route geometry', () => {
    const trip = {
      departure: { latitude: 48, longitude: 2 },
      arrival: { latitude: 47, longitude: 8 },
      nights: [{ latitude: 44, longitude: 5 }],
      days: [{
        stops: [{ latitude: 46, longitude: 3 }],
        route_geometry: { coordinates: [[1, 49], [7, 43]] },
      }],
    } as Trip

    expect(getTripMapBounds(trip)).toEqual({
      minLatitude: 43,
      maxLatitude: 49,
      minLongitude: 1,
      maxLongitude: 8,
    })
  })

  it('returns null when the trip has no usable coordinate', () => {
    expect(getTripMapBounds({ departure: null, arrival: null, nights: [], days: [] } as unknown as Trip)).toBeNull()
  })
})
