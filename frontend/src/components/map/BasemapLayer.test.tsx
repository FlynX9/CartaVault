import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { BasemapLayer } from './BasemapLayer'
import { getStadiaBasemapConfig } from '../../api/stadiaMaps'
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
  TileLayer: ({ url, attribution, maxZoom, eventHandlers }: { url: string; attribution: string; maxZoom: number; eventHandlers: { tileerror: () => void } }) => <button type="button" data-testid="tile-layer" data-url={url} data-attribution={attribution} data-max-zoom={maxZoom} onClick={eventHandlers.tileerror} />,
  useMap: () => mapMock,
}))
vi.mock('../../map/maplibreStyle', () => ({ loadCartaVaultStyle: vi.fn() }))
vi.mock('../../api/stadiaMaps', () => ({ getStadiaBasemapConfig: vi.fn().mockResolvedValue({ personal_key_active: false, tile_url: null }) }))
vi.mock('../../api/vectorBasemap', () => ({ getCartaVaultVectorConfig: vi.fn().mockResolvedValue({ enabled: true, available: true, country_code: 'FR', country_name: 'France', state: 'ready', phase: 'Disponible', error_code: null, error_message: null, archive_url: '/api/basemaps/cartavault/archive/fr.pmtiles', glyphs_url: '/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf', version: 'test', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000, attribution: 'OpenStreetMap' }) }))
vi.mock('../../map/vectorBasemapProtocol', () => ({ configureCartaVaultProtocol: vi.fn(), cartaVaultTileTemplate: vi.fn(() => 'cartavault://test/{z}/{x}/{y}') }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('BasemapLayer', () => {
  it('renders exactly the selected registry tile source', () => {
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    const layer = screen.getByTestId('tile-layer')
    expect(layer).toHaveAttribute('data-url', expect.stringContaining('alidade_satellite'))
    expect(layer).toHaveAttribute('data-max-zoom', '20')
    expect(layer.getAttribute('data-attribution')).toContain('CNES')
  })

  it('uses the personal Stadia tile URL when a verified optional key exists', async () => {
    vi.mocked(getStadiaBasemapConfig).mockResolvedValue({ personal_key_active: true, tile_url: 'https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg?api_key=personal' })
    render(<BasemapLayer basemapId="satellite" onTileError={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('tile-layer')).toHaveAttribute('data-url', expect.stringContaining('api_key=personal')))
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

  it('restores the matching Stadia theme while the country PMTiles is absent', async () => {
    vi.mocked(getCartaVaultVectorConfig).mockResolvedValue({ enabled: true, available: false, country_code: 'FR', country_name: 'France', state: 'generating', phase: 'Génération', error_code: null, error_message: null, archive_url: null, glyphs_url: '', version: 'missing', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000, attribution: 'OpenStreetMap' })
    const layer = { addTo: vi.fn(), removeFrom: vi.fn(), getMaplibreMap: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })) }
    vi.mocked(loadCartaVaultStyle).mockResolvedValue({ version: 8, sources: {}, layers: [] })
    vi.spyOn(L, 'maplibreGL').mockReturnValue(layer as unknown as L.MaplibreGLLayer)
    const onTileError = vi.fn()

    render(<BasemapLayer basemapId="cartavault-dark" countryCode="FR" onTileError={onTileError} />)
    await waitFor(() => expect(screen.getByTestId('tile-layer')).toHaveAttribute('data-url', expect.stringContaining('alidade_smooth_dark')))
    expect(onTileError).not.toHaveBeenCalled()
    expect(loadCartaVaultStyle).not.toHaveBeenCalled()
    expect(layer.addTo).not.toHaveBeenCalled()
  })
})
