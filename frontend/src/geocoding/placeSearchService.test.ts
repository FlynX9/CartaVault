import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchGooglePlaces } from '../api/googlePlaces'
import { geocodingService } from './geocodingService'
import { PlaceSearchService } from './placeSearchService'

vi.mock('../api/googlePlaces', () => ({ searchGooglePlaces: vi.fn() }))
vi.mock('./geocodingService', () => ({ geocodingService: { search: vi.fn() } }))

const GOOGLE_RESULT = { id: 'google:hotel', name: 'Panorama Boutique Hotel', formattedAddress: '13 Samreklo Street, 0103 Tbilisi, Georgia', latitude: 41.697122, longitude: 44.8135, countryCode: 'GE', source: 'google_places' }
const STADIA_RESULT = { id: 'stadia:hotel', name: 'Panorama Boutique Hotel', formattedAddress: '13 Samreklo Street, 0103 Tbilisi, Georgia', latitude: 41.6971, longitude: 44.8134, countryCode: 'GE', source: 'stadia' }

describe('PlaceSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(geocodingService.search).mockResolvedValue([])
  })

  it('uses only Stadia when Google Places is not selected', async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue({ items: [], available: false, warning_code: 'GOOGLE_PLACES_NOT_SELECTED' })
    vi.mocked(geocodingService.search).mockResolvedValue([STADIA_RESULT])

    const results = await new PlaceSearchService().search('13 Samreklo Street, 0103 Tbilisi', { countryCode: 'GE', limit: 6 })

    expect(results).toEqual([STADIA_RESULT])
    expect(geocodingService.search).toHaveBeenCalledOnce()
  })

  it('uses only Google Places when it is selected', async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue({ items: [GOOGLE_RESULT], available: true, warning_code: null })

    const results = await new PlaceSearchService().search('Panorama Boutique Hotel', { countryCode: 'GE', limit: 8 })

    expect(results).toEqual([GOOGLE_RESULT])
    expect(searchGooglePlaces).toHaveBeenCalledWith('Panorama Boutique Hotel', 'GE', 8, undefined)
    expect(geocodingService.search).not.toHaveBeenCalled()
  })

  it('does not silently fall back to Stadia when the selected Google credential is unavailable', async () => {
    vi.mocked(searchGooglePlaces).mockResolvedValue({ items: [], available: false, warning_code: 'GOOGLE_PLACES_CREDENTIAL_UNAVAILABLE' })

    await expect(new PlaceSearchService().search('Panorama Boutique Hotel', { countryCode: 'GE' })).rejects.toThrow('Google Places est sélectionné')
    expect(geocodingService.search).not.toHaveBeenCalled()
  })

  it('resolves coordinates locally without calling an external provider', async () => {
    const results = await new PlaceSearchService().search('41.697122, 44.8135')

    expect(results[0]).toMatchObject({ latitude: 41.697122, longitude: 44.8135 })
    expect(searchGooglePlaces).not.toHaveBeenCalled()
    expect(geocodingService.search).not.toHaveBeenCalled()
  })
})
