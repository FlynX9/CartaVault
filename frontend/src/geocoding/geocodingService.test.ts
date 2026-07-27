import { describe, expect, it, vi } from 'vitest'

import { GeocodingService } from './geocodingService'
import type { Geocoder, GeocodingResult } from './types'

const WORLD_RESULT: GeocodingResult = {
  id: 'world-result',
  name: 'Paris',
  formattedAddress: 'Paris, France',
  latitude: 48.8566,
  longitude: 2.3522,
  source: 'test',
}

describe('GeocodingService', () => {
  it('falls back to a worldwide search when the active country has no result', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([WORLD_RESULT])
    const geocoder: Geocoder = { search, reverse: vi.fn() }
    const service = new GeocodingService(geocoder)

    await expect(service.search('Paris', { countryCode: 'DE', focus: [51, 11], limit: 6 })).resolves.toEqual([WORLD_RESULT])
    expect(search).toHaveBeenNthCalledWith(1, 'Paris', { countryCode: 'DE', focus: [51, 11], limit: 6 })
    expect(search).toHaveBeenNthCalledWith(2, 'Paris', { countryCode: undefined, focus: [51, 11], limit: 6 })
  })

  it('does not issue a worldwide request when the country search succeeds', async () => {
    const search = vi.fn().mockResolvedValue([WORLD_RESULT])
    const service = new GeocodingService({ search, reverse: vi.fn() })

    await service.search('Paris', { countryCode: 'FR' })

    expect(search).toHaveBeenCalledTimes(1)
  })
})
