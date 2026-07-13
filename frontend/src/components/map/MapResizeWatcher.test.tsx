import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MapResizeWatcher } from './MapResizeWatcher'

const { invalidateSize } = vi.hoisted(() => ({
  invalidateSize: vi.fn(),
}))

vi.mock('react-leaflet', () => ({
  useMap: () => ({ invalidateSize }),
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('MapResizeWatcher', () => {
  it('invalidates Leaflet after the sidebar layout transition', () => {
    const { rerender } = render(<MapResizeWatcher sidebarOpen={false} />)
    vi.advanceTimersByTime(220)
    invalidateSize.mockClear()

    rerender(<MapResizeWatcher sidebarOpen />)
    vi.advanceTimersByTime(219)
    expect(invalidateSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(invalidateSize).toHaveBeenCalledWith({ pan: false })
  })
})
