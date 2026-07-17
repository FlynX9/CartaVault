import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MapDoubleClickZoomController } from './MapDoubleClickZoomController'

const { disable, enable, map } = vi.hoisted(() => ({ disable: vi.fn(), enable: vi.fn(), map: { doubleClickZoom: { disable: vi.fn(), enable: vi.fn() } } }))
vi.mock('react-leaflet', () => ({ useMap: () => map }))

describe('MapDoubleClickZoomController', () => {
  it('disables Leaflet double-click zoom only during trip planning', () => {
    map.doubleClickZoom.disable = disable; map.doubleClickZoom.enable = enable
    const { rerender } = render(<MapDoubleClickZoomController disabled />)
    expect(disable).toHaveBeenCalledOnce()
    rerender(<MapDoubleClickZoomController disabled={false} />)
    expect(enable).toHaveBeenCalled()
  })
})
