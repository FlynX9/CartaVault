import { describe, expect, it } from 'vitest'

import { buildGoogleMapsUrl } from './googleMaps'

describe('buildGoogleMapsUrl', () => {
  it('encodes latitude and longitude in the official search URL', () => {
    expect(buildGoogleMapsUrl(48.17, 6.45)).toBe(
      'https://www.google.com/maps/search/?api=1&query=48.17%2C6.45',
    )
  })

  it('returns null when either coordinate is absent', () => {
    expect(buildGoogleMapsUrl(null, 6.45)).toBeNull()
    expect(buildGoogleMapsUrl(48.17, null)).toBeNull()
  })
})
