import { describe, expect, it } from 'vitest'

import type { PoiMap } from '../../types/map'
import { buildMapOpeningFocusRequest, getMapOpeningConfigurationKey } from './mapOpeningFocus'

const BASE_MAP = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'France',
  country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  country: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    iso_alpha2: 'FR',
    iso_alpha3: 'FRA',
    name: 'France',
  },
  center_latitude: null,
  center_longitude: null,
  default_zoom: null,
  effective_center_latitude: 46.2,
  effective_center_longitude: 2.2,
  effective_default_zoom: 5,
  min_latitude: 42.5,
  max_latitude: 51.15,
  min_longitude: -5,
  max_longitude: 9.56,
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
} satisfies PoiMap

describe('buildMapOpeningFocusRequest', () => {
  it('frames the complete primary country territory', () => {
    expect(buildMapOpeningFocusRequest(BASE_MAP, 4)).toEqual({
      id: 4,
      bounds: {
        minLatitude: 42.5,
        maxLatitude: 51.15,
        minLongitude: -5,
        maxLongitude: 9.56,
      },
      maxZoom: 9,
    })
  })

  it('falls back to the configured view when country bounds are unavailable', () => {
    expect(buildMapOpeningFocusRequest({
      ...BASE_MAP,
      min_latitude: null,
      max_latitude: null,
      min_longitude: null,
      max_longitude: null,
    }, 5)).toEqual({
      id: 5,
      view: { center: [46.2, 2.2], zoom: 5 },
    })
  })

  it('avoids unusable world-spanning bounds', () => {
    expect(buildMapOpeningFocusRequest({
      ...BASE_MAP,
      min_longitude: -180,
      max_longitude: 180,
    }, 6)).toEqual({
      id: 6,
      view: { center: [46.2, 2.2], zoom: 5 },
    })
  })
})

describe('getMapOpeningConfigurationKey', () => {
  it('changes when country bounds become available after an access refresh', () => {
    const withoutBounds = {
      ...BASE_MAP,
      min_latitude: null,
      max_latitude: null,
      min_longitude: null,
      max_longitude: null,
    }

    expect(getMapOpeningConfigurationKey(BASE_MAP)).not.toBe(
      getMapOpeningConfigurationKey(withoutBounds),
    )
  })
})
