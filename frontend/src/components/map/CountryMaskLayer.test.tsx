import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCountryBoundary } from '../../api/countries'
import { CountryMaskLayer } from './CountryMaskLayer'

vi.mock('../../api/countries', () => ({ getCountryBoundary: vi.fn() }))
vi.mock('react-leaflet', () => ({
  useMapEvents: () => ({
    getZoom: () => 9,
    attributionControl: { addAttribution: vi.fn(), removeAttribution: vi.fn() },
  }),
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
      detail: 'high',
      point_count: 10,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [[2, 48], [3, 48], [3, 49], [2, 48]],
            [[2.2, 48.2], [2.3, 48.2], [2.3, 48.3], [2.2, 48.2]],
          ],
          [[[-61, 16], [-60, 16], [-60, 17], [-61, 16]]],
        ],
      },
    })

    render(<CountryMaskLayer countryId="11111111-1111-4111-8111-111111111111" enabled />)

    const mask = await screen.findByTestId('country-mask')
    expect(getCountryBoundary).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'high', expect.any(AbortSignal))
    expect(mask).toHaveAttribute('data-rings', '4')
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
