import { describe, expect, it } from 'vitest'

import { calculateHorizontalPopupPan, calculateVerticalPopupPan } from './mapPopupViewport'

describe('map popup viewport positioning', () => {
  it('moves a popup hidden behind the trip dock into the free map column', () => {
    expect(calculateHorizontalPopupPan({
      popupLeft: 420,
      popupRight: 820,
      availableLeft: 700,
      availableRight: 1200,
    })).toBe(-280)
  })

  it('moves a popup overflowing the right edge back into view', () => {
    expect(calculateHorizontalPopupPan({
      popupLeft: 900,
      popupRight: 1300,
      availableLeft: 700,
      availableRight: 1200,
    })).toBe(100)
  })

  it('centers a popup when the remaining map column is narrower than it', () => {
    expect(calculateHorizontalPopupPan({
      popupLeft: 500,
      popupRight: 900,
      availableLeft: 800,
      availableRight: 1000,
    })).toBe(-200)
  })

  it('keeps an already visible popup in place', () => {
    expect(calculateHorizontalPopupPan({
      popupLeft: 760,
      popupRight: 1100,
      availableLeft: 700,
      availableRight: 1200,
    })).toBe(0)
    expect(calculateVerticalPopupPan({
      popupTop: 40,
      popupBottom: 500,
      availableTop: 14,
      availableBottom: 700,
    })).toBe(0)
  })
})
