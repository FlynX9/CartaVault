import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMapPlaces, getPlaces, parseMapPlacesResponse, parseMapPlacesResult, parsePlaceDetailsResponse } from './places'

const PLACE_ID = '11111111-1111-4111-8111-111111111111'; const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const COUNTRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const base = { id: PLACE_ID, map_id: MAP_ID, name: 'Manufacture', longitude: 6.45, latitude: 48.17, status: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'À faire', slug: 'a-faire', color: '#2563EB', functional_state: 'non_visited' }, categories: [], tags: [] }
afterEach(() => vi.unstubAllGlobals())

describe('normalized place API', () => {
  it('validates lightweight map markers including map_id', () => { const marker = parseMapPlacesResponse([base])[0]; expect(marker?.map_id).toBe(MAP_ID); expect(marker?.status).not.toHaveProperty('is_active') })
  it('accepts explicit map truncation metadata', () => {
    expect(parseMapPlacesResult({ items: [base], total: 2, returned: 1, truncated: true })).toMatchObject({ total: 2, returned: 1, truncated: true })
  })
  it('validates detailed map and country summaries without free country', () => {
    const place = parsePlaceDetailsResponse({ ...base, status: { ...base.status, map_id: MAP_ID, is_active: true }, description: null, map: { id: MAP_ID, name: 'France', country: { id: COUNTRY_ID, iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' } }, region: null, construction_date: null, abandonment_date: null, condition: null, access: null, danger_level: null, created_at: '2026-07-13T10:00:00', updated_at: '2026-07-13T10:00:00' })
    expect(place.map.country.iso_alpha3).toBe('FRA'); expect(place).not.toHaveProperty('country')
  })
  it('sends map_id and status_id to marker and list endpoints', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))); vi.stubGlobal('fetch', fetchMock)
    await getMapPlaces({ mapId: MAP_ID, statusId: base.status.id, bounds: { minLatitude: 40, maxLatitude: 50, minLongitude: -5, maxLongitude: 10 } }, new AbortController().signal)
    await getPlaces({ mapId: MAP_ID, statusId: base.status.id })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`status_id=${base.status.id}`); expect(String(fetchMock.mock.calls[0]?.[0])).toContain('include_meta=true'); expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`status_id=${base.status.id}`)
  })
})
