import { describe, expect, it } from 'vitest'

import { isTemporaryMapMode, resolveInteractiveMapMode } from './mapToolMode'

describe('interactive map mode arbitration', () => {
  it('gives precedence to external modes over temporary tools', () => {
    expect(resolveInteractiveMapMode({ internalMode: 'measurement', placeCreationActive: false, tripPlanningActive: false, pointSelectionActive: true })).toBe('point-selection')
    expect(resolveInteractiveMapMode({ internalMode: 'measurement', placeCreationActive: false, tripPlanningActive: true, pointSelectionActive: true })).toBe('trip-planning')
    expect(resolveInteractiveMapMode({ internalMode: 'measurement', placeCreationActive: true, tripPlanningActive: true, pointSelectionActive: true })).toBe('place-creation')
  })

  it('keeps the selected internal mode during normal navigation', () => {
    expect(resolveInteractiveMapMode({ internalMode: 'area-selection', placeCreationActive: false, tripPlanningActive: false, pointSelectionActive: false })).toBe('area-selection')
  })

  it('identifies every cancellable temporary mode', () => {
    expect(isTemporaryMapMode('measurement')).toBe(true)
    expect(isTemporaryMapMode('coordinates')).toBe(true)
    expect(isTemporaryMapMode('navigation')).toBe(false)
    expect(isTemporaryMapMode('trip-planning')).toBe(false)
  })
})
