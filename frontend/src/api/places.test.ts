import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  extractCountries,
  getMapPlaces,
  parseMapPlacesResponse,
  parsePlaceDetailsResponse,
} from './places'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222'
const TAG_ID = '33333333-3333-4333-8333-333333333333'

afterEach(() => vi.unstubAllGlobals())

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
      country: 'France',
      region: 'Grand Est',
      construction_date: '1890',
      abandonment_date: null,
      condition: 'Dégradé',
      access: 'Interdit',
      danger_level: 'Élevé',
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
    expect(place).not.toHaveProperty('address')
    expect(place).not.toHaveProperty('owner')
  })

  it('rejects an incoherent detailed response', () => {
    expect(() =>
      parsePlaceDetailsResponse({
        id: PLACE_ID,
        name: 'Réponse incomplète',
      }),
    ).toThrow(/description/)
  })

  it('deduplicates and sorts non-empty countries', () => {
    const base = {
      id: PLACE_ID,
      name: 'POI',
      description: null,
      region: null,
      construction_date: null,
      abandonment_date: null,
      condition: null,
      access: null,
      danger_level: null,
      longitude: 2,
      latitude: 48,
      categories: [],
      tags: [],
      created_at: '2026-07-13T10:00:00',
      updated_at: '2026-07-13T10:00:00',
    }

    expect(extractCountries([
      { ...base, country: ' France ' },
      { ...base, id: CATEGORY_ID, country: 'france' },
      { ...base, id: TAG_ID, country: 'Belgique' },
      { ...base, id: '44444444-4444-4444-8444-444444444444', country: '  ' },
    ])).toEqual(['Belgique', 'france'])
  })

  it('sends the active country with map bounds', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ))
    vi.stubGlobal('fetch', fetchMock)

    await getMapPlaces({
      country: 'France',
      bounds: {
        minLatitude: 40,
        maxLatitude: 50,
        minLongitude: -5,
        maxLongitude: 10,
      },
    }, new AbortController().signal)

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('country=France')
  })
})
