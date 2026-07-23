import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapFocusController } from './MapFocusController'

const { fitBounds, map, setView } = vi.hoisted(() => {
  const stableSetView = vi.fn()
  const stableFitBounds = vi.fn()
  return {
    fitBounds: stableFitBounds,
    map: { fitBounds: stableFitBounds, getContainer: () => ({ closest: () => null }), setView: stableSetView },
    setView: stableSetView,
  }
})

vi.mock('react-leaflet', () => ({
  useMap: () => map,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MapFocusController', () => {
  it('recenters once per focus request and ignores unrelated renders', () => {
    const request = { id: 1, view: { center: [46.6, 1.88] as [number, number], zoom: 6 } }
    const { rerender } = render(<MapFocusController request={request} />)
    expect(setView).toHaveBeenCalledTimes(1)
    expect(setView).toHaveBeenCalledWith([46.6, 1.88], 6)

    rerender(<MapFocusController request={request} />)
    expect(setView).toHaveBeenCalledTimes(1)
  })

  it('fits country bounds with compact padding and a controlled maximum zoom', () => {
    render(<MapFocusController request={{
      id: 2,
      bounds: {
        minLatitude: 42.5,
        maxLatitude: 51.15,
        minLongitude: -5,
        maxLongitude: 9.56,
      },
      maxZoom: 9,
    }} />)

    expect(fitBounds).toHaveBeenCalledWith(
      [[42.5, -5], [51.15, 9.56]],
      { paddingTopLeft: [32, 32], paddingBottomRight: [32, 32], maxZoom: 9 },
    )
    expect(setView).not.toHaveBeenCalled()
  })
})
