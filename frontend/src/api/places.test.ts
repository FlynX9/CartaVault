import { describe, expect, it } from 'vitest'

import { parseMapPlacesResponse, parsePlaceDetailsResponse } from './places'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'
const TAG_ID = '33333333-3333-4333-8333-333333333333'

describe('place response validation', () => {
  it('validates the lightweight map contract', () => {
    expect(
      parseMapPlacesResponse([
        {
          id: PLACE_ID,
          name: 'Ancienne manufacture',
          longitude: 6.45,
          latitude: 48.17,
          categories: [{ id: CATEGORY_ID, name: 'Industrie' }],
          tags: [{ id: TAG_ID, name: 'Brique' }],
        },
      ]),
    ).toHaveLength(1)
  })

  it('validates every field in the detailed place contract', () => {
    const place = parsePlaceDetailsResponse({
      id: PLACE_ID,
      name: 'Ancienne manufacture',
      description: 'Un bâtiment industriel.',
      address: '1 rue des Forges',
      country: 'France',
      region: 'Grand Est',
      construction_date: '1890',
      abandonment_date: null,
      condition: 'Dégradé',
      access: 'Interdit',
      danger_level: 'Élevé',
      owner: null,
      longitude: 6.45,
      latitude: 48.17,
      categories: [
        {
          id: CATEGORY_ID,
          name: 'Industrie',
          description: null,
        },
      ],
      tags: [{ id: TAG_ID, name: 'Brique' }],
      created_at: '2026-07-13T10:00:00',
      updated_at: '2026-07-13T11:00:00',
    })

    expect(place.name).toBe('Ancienne manufacture')
    expect(place.categories[0]?.description).toBeNull()
  })

  it('rejects an incoherent detailed response', () => {
    expect(() =>
      parsePlaceDetailsResponse({
        id: PLACE_ID,
        name: 'Réponse incomplète',
      }),
    ).toThrow(/description/)
  })
})
