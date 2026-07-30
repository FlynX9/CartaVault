import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MapResizeWatcher } from './MapResizeWatcher'

const invalidateSize = vi.fn()
const container = document.createElement('div')
let resizeCallback: ResizeObserverCallback

vi.mock('react-leaflet', () => ({
  useMap: () => ({
    invalidateSize,
    getContainer: () => container,
  }),
}))

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback
  }
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('MapResizeWatcher', () => {
  it('coalesces repeated panel resize observations into one animation frame', () => {
    let scheduledFrame: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    render(<MapResizeWatcher layoutKey="places-open" />)

    act(() => {
      resizeCallback([], {} as ResizeObserver)
      resizeCallback([], {} as ResizeObserver)
      resizeCallback([], {} as ResizeObserver)
    })

    expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2)
    expect(invalidateSize).not.toHaveBeenCalled()
    act(() => scheduledFrame?.(0))
    expect(invalidateSize).toHaveBeenCalledTimes(1)
    expect(invalidateSize).toHaveBeenCalledWith({ pan: false })
  })

  it('performs one final invalidation after a panel layout transition', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    render(<MapResizeWatcher layoutKey="places-open" />)

    act(() => vi.advanceTimersByTime(220))

    expect(invalidateSize).toHaveBeenCalledTimes(1)
  })
})
