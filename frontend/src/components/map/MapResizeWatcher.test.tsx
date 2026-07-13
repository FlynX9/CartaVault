import { cleanup, fireEvent, render } from '@testing-library/react'
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
})
