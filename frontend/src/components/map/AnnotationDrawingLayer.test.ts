import { describe, expect, it } from 'vitest'

import { triangleFromBounds } from './AnnotationDrawingLayer'

describe('triangleFromBounds', () => {
  it('always creates a triangle whose tip points north', () => {
    expect(triangleFromBounds(
      { latitude: 48.9, longitude: 2.1 },
      { latitude: 48.2, longitude: 2.8 },
    )).toEqual([
      { latitude: 48.2, longitude: 2.1 },
      { latitude: 48.2, longitude: 2.8 },
      { latitude: 48.9, longitude: 2.45 },
    ])
  })
})
