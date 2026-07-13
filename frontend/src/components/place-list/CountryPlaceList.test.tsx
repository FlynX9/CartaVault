import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPlaces } from '../../api/places'
import type { PlaceDetails } from '../../types/place'
import { CountryPlaceList } from './CountryPlaceList'

vi.mock('../../api/places', () => ({ getPlaces: vi.fn() }))

const makePlace = (id: string, name: string): PlaceDetails => ({
  id,
  name,
  description: null,
  country: 'France',
  region: null,
  construction_date: null,
  abandonment_date: null,
  condition: null,
  access: null,
  danger_level: null,
  longitude: 2.35,
  latitude: 48.85,
  categories: [],
  tags: [],
  created_at: '2026-07-13T10:00:00',
  updated_at: '2026-07-13T10:00:00',
})

beforeEach(() => {
  vi.mocked(getPlaces).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('CountryPlaceList', () => {
  it('loads one country and sorts its POI alphabetically', async () => {
    vi.mocked(getPlaces).mockResolvedValueOnce([
      makePlace('22222222-2222-4222-8222-222222222222', 'Usine'),
      makePlace('11111111-1111-4111-8111-111111111111', 'Église'),
      makePlace('33333333-3333-4333-8333-333333333333', 'château'),
    ])
    const { container } = render(
      <CountryPlaceList
        country="France"
        selectedPlaceId={null}
        refreshVersion={0}
        removedPlaceId={null}
        onPlaceSelect={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'Église' })
    expect(
      [...container.querySelectorAll('.place-list-item strong')].map((item) => item.textContent),
    ).toEqual(['château', 'Église', 'Usine'])
    expect(getPlaces).toHaveBeenCalledWith(
      { country: 'France', q: undefined, limit: 100, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('debounces a server search combined with the country', async () => {
    vi.useFakeTimers()
    render(
      <CountryPlaceList
        country="France"
        selectedPlaceId={null}
        refreshVersion={0}
        removedPlaceId={null}
        onPlaceSelect={vi.fn()}
      />,
    )
    await act(async () => {})
    vi.mocked(getPlaces).mockClear()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher un POI' }), {
      target: { value: 'mine' },
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(getPlaces).toHaveBeenCalledWith(
      { country: 'France', q: 'mine', limit: 100, offset: 0 },
      expect.any(AbortSignal),
    )
  })

  it('loads the next API page on demand', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      makePlace(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `POI ${index}`),
    )
    vi.mocked(getPlaces)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([makePlace('99999999-9999-4999-8999-999999999999', 'Suite')])

    render(
      <CountryPlaceList
        country="France"
        selectedPlaceId={null}
        refreshVersion={0}
        removedPlaceId={null}
        onPlaceSelect={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Charger plus' }))

    await waitFor(() => expect(getPlaces).toHaveBeenLastCalledWith({
      country: 'France',
      q: undefined,
      limit: 100,
      offset: 100,
    }))
    expect(await screen.findByRole('button', { name: 'Suite' })).toBeVisible()
  })

  it('opens a coordinate-less POI and removes a deleted item immediately', async () => {
    const place = { ...makePlace('11111111-1111-4111-8111-111111111111', 'Sans position'), latitude: null, longitude: null }
    vi.mocked(getPlaces).mockResolvedValueOnce([place])
    const onPlaceSelect = vi.fn()
    const { rerender } = render(
      <CountryPlaceList
        country="France"
        selectedPlaceId={null}
        refreshVersion={0}
        removedPlaceId={null}
        onPlaceSelect={onPlaceSelect}
      />,
    )

    const item = (await screen.findByText('Sans position')).closest('button')
    expect(item).not.toBeNull()
    fireEvent.click(item!)
    expect(onPlaceSelect).toHaveBeenCalledWith(place)

    rerender(
      <CountryPlaceList
        country="France"
        selectedPlaceId={null}
        refreshVersion={0}
        removedPlaceId={place.id}
        onPlaceSelect={onPlaceSelect}
      />,
    )
    expect(screen.queryByText('Sans position')).not.toBeInTheDocument()
  })
})
