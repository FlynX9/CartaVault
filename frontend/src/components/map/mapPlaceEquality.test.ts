import { describe, expect, it } from 'vitest'

import type { MapPlace } from '../../types/place'
import { areMapPlacesEqual } from './mapPlaceEquality'

const marker: MapPlace = {
  id: 'place-1', map_id: 'map-1', name: 'Manufacture', latitude: 48, longitude: 2,
  status: { id: 'status-1', name: 'À visiter', slug: 'to-visit', color: '#0FA68A', functional_state: 'non_visited' },
  categories: [{ id: 'category-1', name: 'Industrie', icon: 'mdi:factory', is_primary: true }],
  tags: [{ id: 'tag-1', name: 'Urbex', color: '#2563EB' }],
  is_favorite: false, is_visited: false, interest_rating: null, visit_rating: null,
}

describe('areMapPlacesEqual', () => {
  it('retains marker data when a refresh returns the same payload', () => {
    expect(areMapPlacesEqual([marker], [{ ...marker, categories: [...marker.categories], tags: [...marker.tags] }])).toBe(true)
  })

  it('detects a marker change that Leaflet must render', () => {
    expect(areMapPlacesEqual([marker], [{ ...marker, longitude: 2.1 }])).toBe(false)
  })
})
