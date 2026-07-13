import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapFocusController } from './MapFocusController'

const { map, setView } = vi.hoisted(() => {
  const stableSetView = vi.fn()
  return { map: { setView: stableSetView }, setView: stableSetView }
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
})
