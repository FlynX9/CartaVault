import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { getGoogleMapsJavaScriptConfig, markGoogleMapsJavaScriptLoaded } from '../../api/googleSatellite'
import { loadGoogleMapsJavaScript, recordGoogleMapInstanceCreated, recordGoogleMapInstanceDestroyed } from '../../map/googleMapsJavaScript'
import { GoogleMapsJavaScriptBasemap } from './GoogleMapsJavaScriptBasemap'

const { container, mapMock, moveCamera, GoogleMap } = vi.hoisted(() => {
  const container = document.createElement('div')
  const moveCamera = vi.fn()
  const GoogleMap = vi.fn(function GoogleMap() { return { moveCamera } })
  return {
    container,
    moveCamera,
    GoogleMap,
    mapMock: {
      getContainer: vi.fn(() => container),
      getCenter: vi.fn(() => ({ lat: 48.8566, lng: 2.3522 })),
      getZoom: vi.fn(() => 12),
      on: vi.fn(),
      off: vi.fn(),
    },
  }
})

vi.mock('react-leaflet', () => ({ useMap: () => mapMock }))
vi.mock('../../api/googleSatellite', () => ({
  getGoogleMapsJavaScriptConfig: vi.fn(),
  markGoogleMapsJavaScriptLoaded: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../map/googleMapsJavaScript', () => ({
  loadGoogleMapsJavaScript: vi.fn(),
  onGoogleMapsAuthenticationFailure: vi.fn(() => vi.fn()),
  recordGoogleMapInstanceCreated: vi.fn(),
  recordGoogleMapInstanceDestroyed: vi.fn(),
}))

beforeEach(() => {
  container.replaceChildren()
  container.className = ''
  vi.mocked(getGoogleMapsJavaScriptConfig).mockResolvedValue({ api_key: 'browser-key', language: 'fr', region: '', map_type: 'satellite' })
  vi.mocked(loadGoogleMapsJavaScript).mockResolvedValue({ Map: GoogleMap } as unknown as google.maps.MapsLibrary)
  vi.stubGlobal('google', { maps: { event: { addListenerOnce: vi.fn((_map, _event, callback) => callback()) } } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('GoogleMapsJavaScriptBasemap', () => {
  it('creates one satellite map, synchronizes the Leaflet camera, and reuses it across switches', async () => {
    const onError = vi.fn()
    const view = render(<GoogleMapsJavaScriptBasemap active onError={onError} />)

    await waitFor(() => expect(GoogleMap).toHaveBeenCalledTimes(1))
    expect(GoogleMap).toHaveBeenCalledWith(expect.any(HTMLDivElement), expect.objectContaining({
      center: { lat: 48.8566, lng: 2.3522 }, zoom: 12, mapTypeId: 'satellite', gestureHandling: 'none',
    }))
    expect(recordGoogleMapInstanceCreated).toHaveBeenCalledTimes(1)
    expect(markGoogleMapsJavaScriptLoaded).toHaveBeenCalledTimes(1)

    const syncCamera = mapMock.on.mock.calls.find(([events]) => events === 'move zoom resize')?.[1]
    mapMock.getCenter.mockReturnValue({ lat: 43.2965, lng: 5.3698 })
    mapMock.getZoom.mockReturnValue(9)
    syncCamera()
    expect(moveCamera).toHaveBeenCalledWith({ center: { lat: 43.2965, lng: 5.3698 }, zoom: 9 })

    view.rerender(<GoogleMapsJavaScriptBasemap active={false} onError={onError} />)
    view.rerender(<GoogleMapsJavaScriptBasemap active onError={onError} />)
    expect(GoogleMap).toHaveBeenCalledTimes(1)
    expect(getGoogleMapsJavaScriptConfig).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()

    view.unmount()
    expect(recordGoogleMapInstanceDestroyed).toHaveBeenCalledTimes(1)
    expect(mapMock.off).toHaveBeenCalledWith('move zoom resize', syncCamera)
  })

  it('reports a missing or rejected browser credential to the existing fallback controller', async () => {
    const onError = vi.fn()
    vi.mocked(getGoogleMapsJavaScriptConfig).mockRejectedValueOnce(new ApiError(503, 'Clé navigateur manquante.', {}, 'GOOGLE_MAPS_JS_UNAVAILABLE'))

    render(<GoogleMapsJavaScriptBasemap active onError={onError} />)

    await waitFor(() => expect(onError).toHaveBeenCalledWith('google-satellite', true, 'Clé navigateur manquante.', 'GOOGLE_MAPS_JS_UNAVAILABLE'))
    expect(GoogleMap).not.toHaveBeenCalled()
    expect(container.querySelector('.google-maps-js-basemap')).toBeNull()
  })
})
