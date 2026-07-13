import { describe, expect, it } from 'vitest'

import type { MapPlace } from '../../types/place'
import { deriveMapSidebarState } from './sidebarState'

const place: MapPlace = {
  map_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Manufacture',
  latitude: 48.17,
  longitude: 6.45,
  status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true },
  categories: [],
  tags: [],
}

describe('deriveMapSidebarState', () => {
  it('keeps preview local to the map URL', () => {
    expect(deriveMapSidebarState('/', place)).toEqual({ mode: 'preview', place })
  })

  it.each([
    ['/places/new', { mode: 'create' }],
    [`/places/${place.id}`, { mode: 'details', placeId: place.id }],
    [`/places/${place.id}/edit`, { mode: 'edit', placeId: place.id }],
  ])('derives the routed sidebar for %s', (pathname, expected) => {
    expect(deriveMapSidebarState(pathname, null)).toEqual(expected)
  })
})
