import { describe, expect, it } from 'vitest'

import { measureVirtualRowHeight } from './virtualRowMeasurement'

describe('measureVirtualRowHeight', () => {
  it('uses the unscaled layout height for virtual row positioning', () => {
    const element = document.createElement('li')
    Object.defineProperty(element, 'offsetHeight', { value: 112 })
    element.getBoundingClientRect = () => ({
      bottom: 89.6,
      height: 89.6,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    expect(measureVirtualRowHeight(element, 156)).toBe(112)
  })

  it('falls back to the estimated height before layout is available', () => {
    expect(measureVirtualRowHeight(document.createElement('li'), 64)).toBe(64)
  })
})
