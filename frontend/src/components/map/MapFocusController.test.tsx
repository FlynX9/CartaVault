import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapFocusController } from './MapFocusController'

const { fitBounds, map, panBy, setView } = vi.hoisted(() => {
  const stableSetView = vi.fn()
  const stableFitBounds = vi.fn()
  const stablePanBy = vi.fn()
  const container = document.createElement('div')
  return {
    fitBounds: stableFitBounds,
    map: { fitBounds: stableFitBounds, getContainer: () => container, panBy: stablePanBy, setView: stableSetView },
    panBy: stablePanBy,
    setView: stableSetView,
  }
})

vi.mock('react-leaflet', () => ({
  useMap: () => map,
}))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
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

  it('centers a requested point inside the map area left visible by workspace panels', () => {
    const workspace = document.createElement('section')
    workspace.className = 'map-workspace'
    const leftPanel = document.createElement('aside')
    leftPanel.className = 'country-place-panel'
    const rightPanel = document.createElement('aside')
    rightPanel.className = 'map-sidebar'
    const container = map.getContainer()
    workspace.append(leftPanel, container, rightPanel)
    document.body.append(workspace)

    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 1200 })
    container.getBoundingClientRect = () => ({ top: 0, right: 1200, bottom: 800, left: 0, width: 1200, height: 800, x: 0, y: 0, toJSON: () => undefined })
    leftPanel.getBoundingClientRect = () => ({ top: 16, right: 200, bottom: 784, left: 16, width: 184, height: 768, x: 16, y: 16, toJSON: () => undefined })
    rightPanel.getBoundingClientRect = () => ({ top: 16, right: 1184, bottom: 784, left: 600, width: 584, height: 768, x: 600, y: 16, toJSON: () => undefined })

    render(<MapFocusController request={{
      id: 3,
      view: { center: [48.123, 6.456], zoom: 13 },
      centerInVisibleWorkspace: true,
    }} />)

    expect(setView).toHaveBeenCalledWith([48.123, 6.456], 13)
    expect(panBy).toHaveBeenCalledWith([200, 0], { animate: false })
  })
})
