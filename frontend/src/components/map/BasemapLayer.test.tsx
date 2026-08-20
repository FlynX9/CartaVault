import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createArcGISBasemapSession } from '../../api/arcgisMaps'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { BasemapLayer } from './BasemapLayer'

const { mapMock } = vi.hoisted(() => ({
  mapMock: {
    attributionControl: { addAttribution: vi.fn(), removeAttribution: vi.fn() },
    hasLayer: vi.fn(() => true),
  },
}))

vi.mock('react-leaflet', () => ({
  TileLayer: ({ url, eventHandlers }: { url: string; eventHandlers: { tileerror: () => void } }) => <button type="button" data-testid="tile-layer" data-url={url} onClick={eventHandlers.tileerror} />,
  useMap: () => mapMock,
}))
vi.mock('../../api/arcgisMaps', () => ({ createArcGISBasemapSession: vi.fn().mockResolvedValue({ tile_url: 'https://services.arcgisonline.com/World_Imagery/tile/{z}/{y}/{x}?token=short', expires: new Date(Date.now() + 600_000).toISOString(), attribution: 'Tiles © Esri', max_zoom: 23 }) }))
vi.mock('../../api/vectorBasemap', () => ({ getCartaVaultVectorConfig: vi.fn().mockResolvedValue({ enabled: true, available: true, country_code: 'FR', state: 'ready', archive_url: '/api/basemaps/cartavault/archive/fr.pmtiles', glyphs_url: '/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf', version: 'test', min_zoom: 0, max_zoom: 14 }) }))
vi.mock('../../pwa/offlineData', () => ({ getOfflineBasemapVersion: vi.fn().mockResolvedValue('offline-v1') }))
vi.mock('../../map/maplibreStyle', () => ({ loadCartaVaultStyle: vi.fn(), localizeCountryNames: vi.fn((style) => style) }))
vi.mock('../../map/vectorBasemapProtocol', () => ({ configureCartaVaultProtocol: vi.fn(), cartaVaultTileTemplate: vi.fn(() => 'cartavault://test/{z}/{x}/{y}') }))
vi.mock('./GoogleMapsJavaScriptBasemap', () => ({
  GoogleMapsJavaScriptBasemap: ({ active, basemapId }: { active: boolean; basemapId: string }) => <span data-testid="google-maps-js" data-active={String(active)} data-basemap-id={basemapId} />,
}))

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('BasemapLayer', () => {
  it('loads OpenFreeMap directly as a MapLibre Leaflet layer', () => {
    const renderer = { on: vi.fn(), once: vi.fn(), off: vi.fn(), isStyleLoaded: vi.fn(() => false), getStyle: vi.fn(), setLayoutProperty: vi.fn() }
    const layer = {
      addTo: vi.fn(),
      removeFrom: vi.fn(),
      getMaplibreMap: vi.fn(() => {
        if (layer.addTo.mock.calls.length === 0) throw new Error('MapLibre is not initialized before Leaflet onAdd')
        return renderer
      }),
    }
    vi.spyOn(L, 'maplibreGL').mockReturnValue(layer as unknown as L.MaplibreGLLayer)
    render(<BasemapLayer basemapId="openfreemap-light" onTileError={vi.fn()} />)
    expect(L.maplibreGL).toHaveBeenCalledWith(expect.objectContaining({ style: 'https://tiles.openfreemap.org/styles/positron' }))
    expect(layer.addTo).toHaveBeenCalledWith(mapMock)
    expect(renderer.on).toHaveBeenCalledWith('error', expect.any(Function))
  })

  it('uses a short ArcGIS session and loads imagery directly from ArcGIS', async () => {
    render(<BasemapLayer basemapId="arcgis-satellite" onTileError={vi.fn()} />)
    expect(await screen.findByTestId('tile-layer')).toHaveAttribute('data-url', expect.stringContaining('arcgisonline.com'))
    expect(createArcGISBasemapSession).toHaveBeenCalledOnce()
  })

  it('uses Google Maps JavaScript without a CartaVault tile layer', () => {
    render(<BasemapLayer basemapId="google-satellite" onTileError={vi.fn()} />)
    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-active', 'true')
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()
  })

  it('keeps OSM as a controlled raster fallback', () => {
    const onTileError = vi.fn()
    render(<BasemapLayer basemapId="osm" onTileError={onTileError} />)
    expect(screen.getByTestId('tile-layer')).toHaveAttribute('data-url', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    fireEvent.click(screen.getByTestId('tile-layer'))
    expect(onTileError).toHaveBeenCalledWith('osm')
  })

  it('requests PMTiles only with the offline purpose', async () => {
    const renderer = { on: vi.fn(), off: vi.fn(), setStyle: vi.fn() }
    const layer = { addTo: vi.fn(), removeFrom: vi.fn(), getMaplibreMap: vi.fn(() => renderer) }
    vi.mocked(loadCartaVaultStyle).mockResolvedValue({ version: 8, sources: {}, layers: [] })
    vi.spyOn(L, 'maplibreGL').mockReturnValue(layer as unknown as L.MaplibreGLLayer)
    render(<BasemapLayer basemapId="offline-vector-light" countryCode="FR" onTileError={vi.fn()} />)
    await waitFor(() => expect(layer.addTo).toHaveBeenCalledWith(mapMock))
    expect(getCartaVaultVectorConfig).toHaveBeenCalledWith(expect.any(AbortSignal), true, 'FR', 'offline')
  })
})
