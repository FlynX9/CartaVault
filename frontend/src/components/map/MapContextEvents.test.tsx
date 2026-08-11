import { describe, expect, it, vi } from 'vitest'

const { useMapEvents } = vi.hoisted(() => ({ useMapEvents: vi.fn() }))

vi.mock('react-leaflet', () => ({ useMapEvents }))

import { MapContextEvents } from './MapContextEvents'

describe('MapContextEvents', () => {
  it('opens the context menu with Leaflet coordinates and container position', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    MapContextEvents({ onOpen, onClose })

    const handlers = useMapEvents.mock.calls[0][0]
    const preventDefault = vi.fn()
    handlers.contextmenu({
      originalEvent: { preventDefault },
      latlng: { lat: 48.1234567, lng: -2.7654321 },
      containerPoint: { x: 120, y: 240 },
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith({ latitude: 48.1234567, longitude: -2.7654321, containerX: 120, containerY: 240 })
    handlers.movestart()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close the POI popup when an annotation shape is clicked', () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const onMapClick = vi.fn()
    MapContextEvents({ onOpen, onClose, onMapClick })
    const target = document.createElement('path')
    target.setAttribute('class', 'place-annotation-shape')
    useMapEvents.mock.calls[0][0].click({ originalEvent: { target } })
    expect(onClose).not.toHaveBeenCalled()
    expect(onMapClick).not.toHaveBeenCalled()
  })
})
