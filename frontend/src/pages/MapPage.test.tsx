import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MapPage } from './MapPage'

vi.mock('../api/account', () => ({
  ACCOUNT_PREFERENCES_UPDATED_EVENT: 'cartavault:preferences-updated',
  getAccountPreferences: vi.fn().mockResolvedValue({ preferred_basemap: 'cartavault-light', density: 'comfortable', startup_panel: 'maps', timezone: 'Europe/Paris', routing: { provider: 'osrm', stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' } }),
  updateAccountPreferences: vi.fn().mockImplementation(async (preferences) => preferences),
}))

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ layoutKey, basemapId, onBasemapTileError }: { layoutKey: string; basemapId: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm'; onBasemapTileError: (id: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm') => void }) => (
    <div data-testid="poi-map" data-layout-key={layoutKey} data-basemap-id={basemapId}>
      <button type="button" onClick={() => onBasemapTileError(basemapId)}>Simuler l'erreur de tuiles</button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('MapPage', () => {
  it('keeps the map and sidebar in the same responsive workspace and falls back after repeated errors', async () => {
    render(
      <MemoryRouter>
        <MapPage
          places={[]}
          selectedPlaceId={null}
          initialView={{ center: [48.17, 6.45], zoom: 13 }}
          isLoading={false}
          errorMessage={null}
          sidebarOpen
          placeListOpen
          statuses={[{ id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }]}
          sidebar={<aside aria-label="Volet de test">Contenu</aside>}
          placeList={<aside aria-label="Liste de test">Liste</aside>}
          focusRequest={null}
          onBoundsChange={vi.fn()}
          onViewChange={vi.fn()}
          onPlaceSelect={vi.fn()}
        />
      </MemoryRouter>,
    )

    const workspace = screen.getByLabelText("Carte des points d'intérêt").parentElement
    expect(workspace).toHaveClass('map-workspace', 'place-list-open', 'sidebar-open')
    const map = await screen.findByTestId('poi-map')
    expect(map).toHaveAttribute('data-layout-key', 'true-true')
    expect(screen.getByLabelText('Liste de test')).toBeVisible()
    expect(screen.getByLabelText('Volet de test')).toBeVisible()
    expect(screen.getByLabelText('Légende des statuts')).toHaveTextContent('À faire')
    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Fond cartographique' }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond Satellite' }))
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'satellite')
    expect(screen.getByTestId('poi-map')).toBe(map)
    const tileError = screen.getByRole('button', { name: "Simuler l'erreur de tuiles" })
    fireEvent.click(tileError)
    fireEvent.click(tileError)
    expect(screen.queryByText(/activé automatiquement/)).not.toBeInTheDocument()
    fireEvent.click(tileError)
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'osm')
    expect(screen.getByRole('status')).toHaveTextContent('OpenStreetMap a été activé automatiquement')
  })

  it('resizes both workspace panels without remounting the map', async () => {
    render(
      <MemoryRouter>
        <MapPage
          places={[]}
          selectedPlaceId={null}
          initialView={{ center: [48.17, 6.45], zoom: 13 }}
          isLoading={false}
          errorMessage={null}
          sidebarOpen
          sidebarResizable
          placeListOpen
          statuses={[]}
          sidebar={<aside aria-label="Sorties">Sorties</aside>}
          placeList={<aside aria-label="Lieux">Lieux</aside>}
          focusRequest={null}
          onBoundsChange={vi.fn()}
          onViewChange={vi.fn()}
          onPlaceSelect={vi.fn()}
        />
      </MemoryRouter>,
    )

    const loadedMap = await screen.findByTestId('poi-map')
    const workspace = loadedMap.closest('.map-workspace') as HTMLElement
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1400 })
    const map = screen.getByTestId('poi-map')

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau de navigation' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' }), { key: 'ArrowLeft' })

    expect(workspace.style.getPropertyValue('--cv-left-panel-width')).toBe('454px')
    expect(workspace.style.getPropertyValue('--cv-right-panel-width')).toBe('664px')
    expect(window.localStorage.getItem('cartavault:left-panel-width')).toBe('454')
    expect(window.localStorage.getItem('cartavault:right-panel-width')).toBe('664')
    expect(screen.getByTestId('poi-map')).toBe(map)
  })

  it('keeps geographic search in full preparation mode and hides it in trip-only view', () => {
    const props = {
      places: [], selectedPlaceId: null, initialView: { center: [48.17, 6.45] as [number, number], zoom: 13 }, isLoading: false,
      errorMessage: null, sidebarOpen: true, placeListOpen: true, statuses: [], sidebar: null, placeList: null,
      focusRequest: null, onBoundsChange: vi.fn(), onViewChange: vi.fn(), onPlaceSelect: vi.fn(),
      trip: { id: 'trip-1', days: [] } as never,
    }
    const { rerender } = render(<MemoryRouter><MapPage {...props} tripViewOnly={false} /></MemoryRouter>)
    expect(screen.getByLabelText('Recherche géographique')).toBeVisible()

    rerender(<MemoryRouter><MapPage {...props} tripViewOnly /></MemoryRouter>)
    expect(screen.queryByLabelText('Recherche géographique')).not.toBeInTheDocument()
  })

  it('persists an explicit selection locally and in account preferences', async () => {
    const account = await import('../api/account')
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48.17, 6.45], zoom: 13 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await screen.findByTestId('poi-map')
    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Fond cartographique' }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond CartaVault Dark' }))
    expect(window.localStorage.getItem('cartavault.basemap')).toBe('cartavault-dark')
    await waitFor(() => expect(account.updateAccountPreferences).toHaveBeenCalledWith(expect.objectContaining({ preferred_basemap: 'cartavault-dark' })))
  })
})
