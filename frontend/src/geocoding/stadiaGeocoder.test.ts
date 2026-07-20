import { describe, expect, it, vi } from 'vitest'
import { stadiaGeocoder } from './stadiaGeocoder'

describe('Stadia geocoder', () => {
  it('uses encoded query parameters, the EU endpoint and no undefined key', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    await stadiaGeocoder.search('Rue & place', { focus: [48, 2], countryCode: 'FR' })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('api-eu.stadiamaps.com/geocoding/v1/search'); expect(url).toContain('text=Rue+%26+place'); expect(url).toContain('boundary.country=FR'); expect(url).not.toContain('api_key=undefined')
  })

  it('keeps the locality and postal code returned by reverse geocoding', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ features: [{ geometry: { coordinates: [6.87342, 47.62689] }, properties: { gid: 'address:1', name: 'Rougemont-le-Château', label: 'Rougemont-le-Château, 90110', locality: 'Rougemont-le-Château', postalcode: '90110' } }] }), { status: 200 }))))
    await expect(stadiaGeocoder.reverse(47.62689, 6.87342)).resolves.toMatchObject([{ locality: 'Rougemont-le-Château', postalCode: '90110' }])
  })
})
