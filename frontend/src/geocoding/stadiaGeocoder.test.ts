import { beforeEach, describe, expect, it, vi } from 'vitest'

import { reverseStadiaPlaces, searchStadiaPlaces } from '../api/stadiaPlaces'
import { stadiaGeocoder } from './stadiaGeocoder'

vi.mock('../api/stadiaPlaces', () => ({
  searchStadiaPlaces: vi.fn(),
  reverseStadiaPlaces: vi.fn(),
}))

describe('Stadia geocoder', () => {
  beforeEach(() => {
    vi.mocked(searchStadiaPlaces).mockResolvedValue({ features: [] })
    vi.mocked(reverseStadiaPlaces).mockResolvedValue({ features: [] })
  })

  it('sends only search parameters to the CartaVault backend', async () => {
    await stadiaGeocoder.search('Rue & place', { focus: [48, 2], countryCode: 'FR' })

    const parameters = vi.mocked(searchStadiaPlaces).mock.calls[0]?.[0]
    expect(parameters?.get('q')).toBe('Rue & place')
    expect(parameters?.get('country_code')).toBe('FR')
    expect(parameters?.get('focus_lat')).toBe('48')
    expect(parameters?.toString()).not.toContain('api_key')
  })

  it('keeps the locality and postal code returned by reverse geocoding', async () => {
    vi.mocked(reverseStadiaPlaces).mockResolvedValueOnce({ features: [{ geometry: { coordinates: [6.87342, 47.62689] }, properties: { gid: 'address:1', name: 'Rougemont-le-Château', label: 'Rougemont-le-Château, 90110', locality: 'Rougemont-le-Château', postalcode: '90110' } }] })

    await expect(stadiaGeocoder.reverse(47.62689, 6.87342)).resolves.toMatchObject([{ locality: 'Rougemont-le-Château', postalCode: '90110' }])
    expect(vi.mocked(reverseStadiaPlaces).mock.calls[0]?.[0].toString()).toBe('latitude=47.62689&longitude=6.87342&limit=1')
  })
})
