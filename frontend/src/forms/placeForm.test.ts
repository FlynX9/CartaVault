import { describe, expect, it } from 'vitest'

import {
  buildCreatePayload,
  buildMinimalUpdatePayload,
  calculateAssociationDiff,
  EMPTY_PLACE_FORM_VALUES,
  validatePlaceForm,
} from './placeForm'

const validValues = {
  ...EMPTY_PLACE_FORM_VALUES,
  name: '  Ancienne forge  ',
  latitude: '48.17',
  longitude: '6.45',
}

describe('place form helpers', () => {
  it('validates required coordinates and their ranges', () => {
    expect(validatePlaceForm(EMPTY_PLACE_FORM_VALUES)).toMatchObject({
      latitude: expect.any(String),
      longitude: expect.any(String),
    })
    expect(validatePlaceForm({ ...validValues, latitude: '91' }).latitude).toMatch(/-90/)
  })

  it('builds the exact create payload and normalizes blank nullable fields', () => {
    expect(buildCreatePayload(validValues)).toEqual({
      name: 'Ancienne forge',
      latitude: 48.17,
      longitude: 6.45,
      description: null,
      address: null,
      country: null,
      region: null,
      construction_date: null,
      abandonment_date: null,
      condition: null,
      access: null,
      danger_level: null,
      owner: null,
    })
  })

  it('only includes changed fields and sends explicit nulls', () => {
    const initial = { ...validValues, owner: 'Ville', description: 'Texte' }
    const current = { ...initial, owner: '  ', description: 'Texte modifié' }
    expect(buildMinimalUpdatePayload(initial, current)).toEqual({
      owner: null,
      description: 'Texte modifié',
    })
  })

  it('calculates stable association additions and removals', () => {
    expect(calculateAssociationDiff(['a', 'b'], ['b', 'c'])).toEqual({
      added: ['c'],
      removed: ['a'],
    })
  })
})
