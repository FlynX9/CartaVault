import { describe, expect, it } from 'vitest'
import { readMapId, withMap } from './map'

describe('map URL state', () => {
  it('reads and writes canonical map paths', () => {
    expect(readMapId('/maps/abc/places/1')).toBe('abc')
    expect(withMap('/places/1', 'abc')).toBe('/maps/abc/places/1')
    expect(withMap('/annotations', 'abc')).toBe('/maps/abc/annotations')
    expect(withMap('/', null)).toBe('/')
  })
})
