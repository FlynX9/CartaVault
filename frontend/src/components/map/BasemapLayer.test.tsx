import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { BasemapLayer } from './BasemapLayer'
import { createGoogleSatelliteSession } from '../../api/googleSatellite'
import { getStadiaBasemapConfig } from '../../api/stadiaMaps'
import { createMapboxTileSession } from '../../api/mapboxMaps'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'

const { mapMock } = vi.hoisted(() => ({
  mapMock: {
    attributionControl: {
      addAttribution: vi.fn(),
      removeAttribution: vi.fn(),
    },
    hasLayer: vi.fn(() => true),
  },
}))

vi.mock('react-leaflet', () => ({
  TileLayer: ({ url, attribution, maxZoom, detectRetina, eventHandlers }: { url: string; attribution: string; maxZoom: number; detectRetina?: boolean; eventHandlers: { tileerror: () => void } }) => <button type="button" data-testid="tile-layer" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} data-detect-retina={String(detectRetina)} onClick={eventHandlers.tileerror} />,
  useMap: () => mapMock,
}))
vi.mock('../../map/maplibreStyle', () => ({ loadCartaVaultStyle: vi.fn() }))
vi.mock('../../api/googleSatellite', () => ({ createGoogleSatelliteSession: vi.fn().mockResolvedValue({ tile_path: '/basemaps/google-satellite/tiles/{z}/{x}/{y}', attribution: '© Google', max_zoom: 22 }) }))
vi.mock('../../api/stadiaMaps', () => ({ getStadiaBasemapConfig: vi.fn().mockResolvedValue({ personal_key_active: false, key_optional: false, tile_path: '/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}?retina={r}' }) }))
vi.mock('../../api/mapboxMaps', () => ({ createMapboxTileSession: vi.fn().mockImplementation(() => Promise.resolve({ tile_path: '/basemaps/mapbox-satellite/tiles/{z}/{x}/{y}', expires: new Date(Date.now() + 600_000).toISOString(), attribution: '© Mapbox © OpenStreetMap', max_zoom: 22 })) }))
vi.mock('../../api/vectorBasemap', () => ({ getCartaVaultVectorConfig: vi.fn().mockResolvedValue({ enabled: true, available: true, country_code: 'FR', country_name: 'France', state: 'ready', phase: 'Disponible', error_code: null, error_message: null, archive_url: '/api/basemaps/cartavault/archive/fr.pmtiles', glyphs_url: '/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf', version: 'test', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000, attribution: 'OpenStreetMap' }) }))
vi.mock('../../map/vectorBasemapProtocol', () => ({ configureCartaVaultProtocol: vi.fn(), cartaVaultTileTemplate: vi.fn(() => 'cartavault://test/{z}/{x}/{y}') }))
vi.mock('./GoogleMapsJavaScriptBasemap', () => ({
  GoogleMapsJavaScriptBasemap: ({ active, basemapId, mapType }: { active: boolean; basemapId: string; mapType: string }) => <span data-testid="google-maps-js" data-active={String(active)} data-basemap-id={basemapId} data-map-type={mapType} />,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('BasemapLayer', () => {
  it('renders the selected source through the authenticated CartaVault proxy', async () => {
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    const layer = await screen.findByTestId('tile-layer')
    expect(layer).toHaveAttribute('data-url', expect.stringContaining('alidade_satellite'))
    expect(layer.getAttribute('data-url')).toMatch(/^\/api\/basemaps\/stadia\//)
    expect(layer).toHaveAttribute('data-max-zoom', '20')
    expect(layer).toHaveAttribute('data-detect-retina', 'false')
    expect(layer.getAttribute('data-attribution')).toContain('CNES')
  })

  it('never puts a personal Stadia key in the browser-visible tile URL', async () => {
    vi.mocked(getStadiaBasemapConfig).mockResolvedValue({ personal_key_active: true, key_optional: false, tile_path: '/basemaps/stadia/tiles/{style}/{z}/{x}/{y}.{extension}?retina={r}' })
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('tile-layer')).toHaveAttribute('data-url', expect.stringContaining('/api/basemaps/stadia/tiles/alidade_satellite/')))
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).not.toContain('api_key')
    expect(getStadiaBasemapConfig).toHaveBeenCalledWith('satellite_basemap', expect.any(AbortSignal))
  })

  it('loads Stadia directly without a key during localhost development', async () => {
    vi.mocked(getStadiaBasemapConfig).mockResolvedValue({ personal_key_active: false, key_optional: true, tile_path: 'https://tiles.stadiamaps.com/tiles/{style}/{z}/{x}/{y}{r}.{extension}' })
    render(<BasemapLayer basemapId="stadia-light" onTileError={vi.fn()} />)
    expect(await screen.findByTestId('tile-layer')).toHaveAttribute('data-url', 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png')
    expect(getStadiaBasemapConfig).toHaveBeenCalledWith('classic_basemap', expect.any(AbortSignal))
  })

  it('creates one opaque Mapbox tile session before rendering tiles', async () => {
    render(<BasemapLayer basemapId="mapbox-satellite" onTileError={vi.fn()} />)

    expect(await screen.findByTestId('tile-layer')).toHaveAttribute('data-url', '/api/basemaps/mapbox-satellite/tiles/{z}/{x}/{y}')
    expect(createMapboxTileSession).toHaveBeenCalledTimes(1)
  })

  it('uses the native Maps JavaScript renderer for Google Satellite', () => {
    render(<BasemapLayer basemapId="google-satellite" onTileError={vi.fn()} />)

    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-map-type', 'satellite')
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()
    expect(createGoogleSatelliteSession).not.toHaveBeenCalled()
  })

  it('keeps Google Satellite Map Tiles as an explicit alternative', async () => {
    render(<BasemapLayer basemapId="google-satellite-tiles" onTileError={vi.fn()} />)

    expect(await screen.findByTestId('tile-layer')).toHaveAttribute('data-url', '/api/basemaps/google-satellite/tiles/{z}/{x}/{y}')
    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-active', 'false')
    expect(createGoogleSatelliteSession).toHaveBeenCalledWith('satellite')
  })

  it('uses the EEA-compatible Maps JavaScript renderer for Google roadmap', () => {
    render(<BasemapLayer basemapId="google-roadmap" onTileError={vi.fn()} />)

    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-basemap-id', 'google-roadmap')
    expect(screen.getByTestId('google-maps-js')).toHaveAttribute('data-map-type', 'roadmap')
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()
    expect(createGoogleSatelliteSession).not.toHaveBeenCalled()
  })

  it('identifies a failing raster source to the fallback controller', () => {
    const onTileError = vi.fn()
    render(<BasemapLayer basemapId="osm" onTileError={onTileError} />)
    fireEvent.click(screen.getByTestId('tile-layer'))
    expect(onTileError).toHaveBeenCalledWith('osm')
  })

  it('safely unmounts a vector layer after MapLibre has already released its map', async () => {
    const mapLibreMap = { on: vi.fn(), off: vi.fn() }
    const layer = {
      addTo: vi.fn(),
      removeFrom: vi.fn(),
      getMaplibreMap: vi.fn()
        .mockReturnValueOnce(mapLibreMap)
        .mockReturnValueOnce(null),
    }
    vi.mocked(loadCartaVaultStyle).mockResolvedValue({ version: 8, sources: {}, layers: [] })
    vi.spyOn(L, 'maplibreGL').mockReturnValue(layer as unknown as L.MaplibreGLLayer)

    const rendered = render(<BasemapLayer basemapId="cartavault-light" onTileError={vi.fn()} />)
    await waitFor(() => expect(layer.addTo).toHaveBeenCalledWith(mapMock))

    expect(() => rendered.unmount()).not.toThrow()
    expect(layer.removeFrom).toHaveBeenCalledWith(mapMock)
    expect(mapLibreMap.off).not.toHaveBeenCalled()
  })

  it('reports an unavailable offline CartaVault archive without using an online fallback', async () => {
    vi.mocked(getCartaVaultVectorConfig).mockResolvedValue({ enabled: true, available: false, country_code: 'FR', country_name: 'France', state: 'generating', phase: 'Génération', error_code: null, error_message: null, archive_url: null, glyphs_url: '', version: 'missing', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000, attribution: 'OpenStreetMap' })
    const layer = { addTo: vi.fn(), removeFrom: vi.fn(), getMaplibreMap: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })) }
    vi.mocked(loadCartaVaultStyle).mockResolvedValue({ version: 8, sources: {}, layers: [] })
    vi.spyOn(L, 'maplibreGL').mockReturnValue(layer as unknown as L.MaplibreGLLayer)
    const onTileError = vi.fn()

    render(<BasemapLayer basemapId="cartavault-dark" countryCode="FR" onTileError={onTileError} />)
    await waitFor(() => expect(onTileError).toHaveBeenCalledWith('cartavault-dark', true))
    expect(screen.queryByTestId('tile-layer')).not.toBeInTheDocument()
    expect(loadCartaVaultStyle).not.toHaveBeenCalled()
    expect(layer.addTo).not.toHaveBeenCalled()
  })
})
