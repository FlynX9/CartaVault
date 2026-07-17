import { describe, expect, it } from 'vitest'

import { formatMinutes, formatRouteDistance, formatRouteDuration } from './tripMetrics'

describe('trip metric formatting', () => {
  it('formats route distances using French conventions', () => {
    expect(formatRouteDistance(8400)).toBe('8,4 km')
    expect(formatRouteDistance(184000)).toBe('184 km')
    expect(formatRouteDistance(184300)).toBe('184,3 km')
    expect(formatRouteDistance(0)).toBe('0,0 km')
    expect(formatRouteDistance(null)).toBe('—')
  })

  it('keeps cumulative durations in hours', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(65)).toBe('1 h 05')
    expect(formatRouteDuration(13_320)).toBe('3 h 42')
    expect(formatMinutes(1_635)).toBe('27 h 15')
    expect(formatMinutes(null)).toBe('—')
  })
})
