import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCountryBoundary } from '../../api/countries'
import { CountryMaskLayer } from './CountryMaskLayer'

vi.mock('../../api/countries', () => ({ getCountryBoundary: vi.fn() }))
vi.mock('react-leaflet', () => ({
  Polygon: ({ positions, smoothFactor, interactive, bubblingMouseEvents }: {
    positions: unknown[]
    smoothFactor: number
    interactive: boolean
    bubblingMouseEvents: boolean
  }) => <output data-testid="country-mask" data-rings={positions.length} data-smooth-factor={smoothFactor} data-interactive={String(interactive)} data-bubbling={String(bubblingMouseEvents)} />,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CountryMaskLayer', () => {
  it('renders the world and every territory as one non-interactive mask', async () => {
    vi.mocked(getCountryBoundary).mockResolvedValue({
      country_id: '11111111-1111-4111-8111-111111111111',
      iso_alpha3: 'FRA',
      point_count: 10,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[2, 48], [3, 48], [3, 49], [2, 48]]],
          [[[-61, 16], [-60, 16], [-60, 17], [-61, 16]]],
        ],
      },
    })

    render(<CountryMaskLayer countryId="11111111-1111-4111-8111-111111111111" enabled />)

    const mask = await screen.findByTestId('country-mask')
    expect(mask).toHaveAttribute('data-rings', '3')
    expect(mask).toHaveAttribute('data-smooth-factor', '0')
    expect(mask).toHaveAttribute('data-interactive', 'false')
    expect(mask).toHaveAttribute('data-bubbling', 'false')
  })

  it('does not fetch or render geometry while disabled', async () => {
    render(<CountryMaskLayer countryId="11111111-1111-4111-8111-111111111111" enabled={false} />)

    await waitFor(() => expect(getCountryBoundary).not.toHaveBeenCalled())
    expect(screen.queryByTestId('country-mask')).not.toBeInTheDocument()
  })
})
