import { describe, expect, it } from 'vitest'
import { buildCreatePayload, buildMinimalUpdatePayload, calculateAssociationDiff, EMPTY_PLACE_FORM_VALUES, validatePlaceForm } from './placeForm'
const values = { ...EMPTY_PLACE_FORM_VALUES, name: ' Forge ', mapId: 'map-a', latitude: '48.17', longitude: '6.45' }
describe('place form helpers', () => {
  it('requires the active map', () => { expect(validatePlaceForm({ ...values, mapId: '' }).mapId).toBeTruthy() })
  it('creates a normalized map-linked payload without country', () => { const payload = buildCreatePayload(values); expect(payload.map_id).toBe('map-a'); expect(payload).not.toHaveProperty('country') })
  it('sends only a changed map relationship', () => { expect(buildMinimalUpdatePayload(values, { ...values, mapId: 'map-b' })).toEqual({ map_id: 'map-b' }) })
  it('calculates association changes', () => { expect(calculateAssociationDiff(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] }) })
})
