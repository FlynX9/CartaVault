import { describe, expect, it } from 'vitest'
import { readMapId, withMap } from './map'
describe('map URL state', () => { it('reads and writes map UUID state', () => { expect(readMapId('?map=abc')).toBe('abc'); expect(withMap('/places/1', 'abc')).toBe('/places/1?map=abc'); expect(withMap('/', null)).toBe('/') }) })
