import { describe, expect, it, vi } from 'vitest'

const { useMapEvents } = vi.hoisted(() => ({ useMapEvents: vi.fn() }))
vi.mock('react-leaflet', () => ({
  useMapEvents,
  Circle: () => null,
  CircleMarker: ({ children }: { children?: unknown }) => children ?? null,
  Rectangle: () => null,
  Tooltip: ({ children }: { children?: unknown }) => children ?? null,
}))

import { MapTemporaryToolsLayer } from './MapTemporaryToolsLayer'

describe('temporary map interaction layer', () => {
  it('previews then locks a two-click extent', () => {
    const onExtentChange = vi.fn()
    MapTemporaryToolsLayer({ mode: 'area-selection', extent: null, coordinate: null, geolocation: null, onExtentChange, onCoordinateChange: vi.fn() })
    let handlers = useMapEvents.mock.calls.at(-1)?.[0]
    handlers.click({ latlng: { lat: 48, lng: 2 } })
    expect(onExtentChange).toHaveBeenCalledWith({ start: { latitude: 48, longitude: 2 }, end: { latitude: 48, longitude: 2 }, locked: false })

    const started = onExtentChange.mock.calls[0][0]
    MapTemporaryToolsLayer({ mode: 'area-selection', extent: started, coordinate: null, geolocation: null, onExtentChange, onCoordinateChange: vi.fn() })
    handlers = useMapEvents.mock.calls.at(-1)?.[0]
    handlers.mousemove({ latlng: { lat: 49, lng: 3 } })
    expect(onExtentChange).toHaveBeenLastCalledWith({ ...started, end: { latitude: 49, longitude: 3 } })
    handlers.click({ latlng: { lat: 49, lng: 3 } })
    expect(onExtentChange).toHaveBeenLastCalledWith({ ...started, end: { latitude: 49, longitude: 3 }, locked: true })
  })

  it('updates coordinates locally without any external request', () => {
    const onCoordinateChange = vi.fn()
    MapTemporaryToolsLayer({ mode: 'coordinates', extent: null, coordinate: null, geolocation: null, onExtentChange: vi.fn(), onCoordinateChange })
    const handlers = useMapEvents.mock.calls.at(-1)?.[0]
    handlers.mousemove({ latlng: { lat: 47.1234567, lng: 1.7654321 } })
    expect(onCoordinateChange).toHaveBeenCalledWith({ latitude: 47.1234567, longitude: 1.7654321 })
  })
})
