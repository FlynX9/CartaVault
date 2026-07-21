import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MapResizeWatcher } from './MapResizeWatcher'

const { invalidateSize, getContainer } = vi.hoisted(() => ({
  invalidateSize: vi.fn(),
  getContainer: vi.fn(),
}))

vi.mock('react-leaflet', () => ({
  useMap: () => ({ invalidateSize, getContainer }),
}))

let resizeCallback: ResizeObserverCallback | null = null

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
  observe = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.useFakeTimers()
  getContainer.mockReturnValue(document.createElement('div'))
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  resizeCallback = null
  vi.useRealTimers()
})

describe('MapResizeWatcher', () => {
  it('invalidates Leaflet after the sidebar layout transition', () => {
    const { rerender } = render(<MapResizeWatcher layoutKey="false-false" />)
    vi.advanceTimersByTime(220)
    invalidateSize.mockClear()

    rerender(<MapResizeWatcher layoutKey="true-false" />)
    vi.advanceTimersByTime(219)
    expect(invalidateSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(invalidateSize).toHaveBeenCalledWith({ pan: false })
  })

  it('invalidates Leaflet after a responsive viewport change', () => {
    render(<MapResizeWatcher layoutKey="true-false" />)
    vi.advanceTimersByTime(220)
    invalidateSize.mockClear()

    fireEvent(window, new Event('resize'))
    vi.advanceTimersByTime(120)

    expect(invalidateSize).toHaveBeenCalledWith({ pan: false })
  })

  it('invalidates Leaflet when a resizable panel changes the map container', () => {
    render(<MapResizeWatcher layoutKey="true-true" />)
    vi.advanceTimersByTime(220)
    invalidateSize.mockClear()

    resizeCallback?.([], {} as ResizeObserver)
    vi.advanceTimersByTime(119)
    expect(invalidateSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(invalidateSize).toHaveBeenCalledWith({ pan: false })
  })
})
