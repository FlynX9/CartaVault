import { describe, expect, it } from 'vitest'

import type { MapPlace } from '../../types/place'
import { areMapPlacesEqual } from './mapPlaceEquality'

const marker: MapPlace = {
  id: 'place-1', map_id: 'map-1', name: 'Manufacture', latitude: 48, longitude: 2,
  status: { id: 'status-1', color: '#0FA68A' },
  primary_category_icon: 'mdi:factory',
  category_ids: ['category-1'],
  tag_ids: ['tag-1'],
  is_favorite: false,
}

describe('areMapPlacesEqual', () => {
  it('retains marker data when a refresh returns the same payload', () => {
    expect(areMapPlacesEqual([marker], [{ ...marker, category_ids: [...marker.category_ids], tag_ids: [...marker.tag_ids] }])).toBe(true)
  })

  it('detects a marker change that Leaflet must render', () => {
    expect(areMapPlacesEqual([marker], [{ ...marker, longitude: 2.1 }])).toBe(false)
  })
})
