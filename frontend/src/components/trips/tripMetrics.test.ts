import { describe, expect, it } from 'vitest'

import { formatClock, formatMinutes, formatRouteDistance, formatRouteDuration, formatScheduleDelta } from './tripMetrics'

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

  it('formats clocks, day offsets and schedule deltas', () => {
    expect(formatClock('22:30:00')).toBe('22:30')
    expect(formatClock('01:15:00', 1)).toBe('01:15 (+1 j)')
    expect(formatClock('22:00:00', -1)).toBe('22:00 (-1 j)')
    expect(formatClock(null)).toBe('—')
    expect(formatScheduleDelta(0)).toBe('À l’heure')
    expect(formatScheduleDelta(25)).toBe('25 min de retard')
    expect(formatScheduleDelta(-65)).toBe('1 h 05 d’avance')
  })
})
