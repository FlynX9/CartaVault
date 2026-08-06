import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MapPage } from './MapPage'

const themeState = vi.hoisted(() => ({
  resolvedTheme: 'light' as 'light' | 'dark',
  setPreference: vi.fn(),
}))

vi.mock('../theme/useTheme', () => ({
  useTheme: () => ({
    preference: 'light',
    resolvedTheme: themeState.resolvedTheme,
    setPreference: themeState.setPreference,
    toggleTheme: vi.fn(),
  }),
}))

vi.mock('../api/account', () => ({
  ACCOUNT_PREFERENCES_UPDATED_EVENT: 'cartavault:preferences-updated',
  getAccountPreferences: vi.fn().mockResolvedValue({ language: 'fr', preferred_basemap: 'cartavault-light', density: 'comfortable', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm', stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' }, places: { provider: 'stadia' } }),
  updateAccountPreferences: vi.fn().mockImplementation(async (preferences) => preferences),
}))

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ layoutKey, basemapId, onBasemapTileError, countryId, countryMaskEnabled, measurementActive, measurementPoints, onMeasurementPointAdd }: { layoutKey: string; basemapId: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm'; onBasemapTileError: (id: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm') => void; countryId?: string | null; countryMaskEnabled?: boolean; measurementActive?: boolean; measurementPoints?: Array<{ latitude: number; longitude: number }>; onMeasurementPointAdd?: (point: { latitude: number; longitude: number }) => void }) => (
    <div data-testid="poi-map" data-layout-key={layoutKey} data-basemap-id={basemapId} data-country-id={countryId ?? ''} data-country-mask={String(countryMaskEnabled)} data-measurement-active={String(measurementActive)} data-measurement-points={measurementPoints?.length ?? 0}>
      <button type="button" onClick={() => onBasemapTileError(basemapId)}>Simuler l'erreur de tuiles</button>
      <button type="button" onClick={() => onMeasurementPointAdd?.({ latitude: 48.8566, longitude: 2.3522 })}>Simuler un clic de mesure</button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  themeState.resolvedTheme = 'light'
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
          statuses={[{ id: 'status-id', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' }]}
          sidebar={<aside aria-label="Volet de test">Contenu</aside>}
          popupContent={<article>Détails du lieu</article>}
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
    const placeDetail = screen.getByRole('complementary', { name: 'Détails du lieu sélectionné' })
    expect(placeDetail).toHaveTextContent('Détails du lieu')
    expect(placeDetail.parentElement).toHaveClass('map-layout')
    const legend = screen.getByRole('complementary', { name: 'Légende des statuts' })
    fireEvent.mouseEnter(legend)
    expect(legend).toHaveTextContent('À faire')
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
    window.localStorage.setItem('cartavault:right-panel-width', '420')
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
          tripPlanningActive
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
    expect(workspace).toHaveClass('trip-planning-open')
    expect(workspace.style.getPropertyValue('--cv-right-panel-width')).toBe('640px')
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1400 })
    const map = screen.getByTestId('poi-map')
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })).toHaveAttribute('aria-valuemin', '640')
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })).toHaveAttribute('aria-valuemax', '1600')

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau de navigation' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' }), { key: 'ArrowRight' })

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
    const props = { places: [], selectedPlaceId: null, initialView: { center: [48.17, 6.45] as [number, number], zoom: 13 }, isLoading: false, errorMessage: null, sidebarOpen: false, placeListOpen: false, statuses: [], sidebar: null, placeList: null, focusRequest: null, onBoundsChange: vi.fn(), onViewChange: vi.fn(), onPlaceSelect: vi.fn() }
    const { rerender } = render(<MemoryRouter><MapPage {...props} /></MemoryRouter>)
    await screen.findByTestId('poi-map')
    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Fond cartographique' }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond CartaVault sombre' }))
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'cartavault-dark')
    expect(themeState.setPreference).not.toHaveBeenCalled()
    rerender(<MemoryRouter><MapPage {...props} /></MemoryRouter>)
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'cartavault-dark')
    expect(window.localStorage.getItem('cartavault.basemap')).toBe('cartavault-dark')
    await waitFor(() => expect(account.updateAccountPreferences).toHaveBeenCalledWith(expect.objectContaining({ preferred_basemap: 'cartavault-dark' })))
  })

  it('keeps the CartaVault vector basemap synchronized with the visual theme', async () => {
    const props = {
      places: [], selectedPlaceId: null, initialView: { center: [48.17, 6.45] as [number, number], zoom: 13 },
      isLoading: false, errorMessage: null, sidebarOpen: false, placeListOpen: false, statuses: [],
      sidebar: null, placeList: null, focusRequest: null, onBoundsChange: vi.fn(), onViewChange: vi.fn(),
      onPlaceSelect: vi.fn(),
    }
    const { rerender } = render(<MemoryRouter><MapPage {...props} /></MemoryRouter>)
    expect(await screen.findByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'cartavault-light')

    themeState.resolvedTheme = 'dark'
    rerender(<MemoryRouter><MapPage {...props} /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'cartavault-dark'))
  })

  it('disables the country mask without remounting the map and persists the choice', async () => {
    const props = {
      places: [], selectedPlaceId: null, initialView: { center: [48.17, 6.45] as [number, number], zoom: 13 },
      isLoading: false, errorMessage: null, sidebarOpen: false, placeListOpen: false, statuses: [],
      sidebar: null, placeList: null, focusRequest: null, onBoundsChange: vi.fn(), onViewChange: vi.fn(),
      onPlaceSelect: vi.fn(), activeCountryId: '11111111-1111-4111-8111-111111111111',
    }
    render(<MemoryRouter><MapPage {...props} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')
    expect(map).toHaveAttribute('data-country-mask', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le masque hors pays' }))

    expect(screen.getByTestId('poi-map')).toBe(map)
    expect(map).toHaveAttribute('data-country-mask', 'false')
    expect(window.localStorage.getItem('cartavault:country-mask-enabled')).toBe('false')
    expect(screen.getByRole('button', { name: 'Activer le masque hors pays' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('measures a multi-point path locally and supports undo and reset', async () => {
    const props = {
      places: [], selectedPlaceId: null, initialView: { center: [48.17, 6.45] as [number, number], zoom: 13 },
      isLoading: false, errorMessage: null, sidebarOpen: false, placeListOpen: false, statuses: [],
      sidebar: null, placeList: null, focusRequest: null, onBoundsChange: vi.fn(), onViewChange: vi.fn(),
      onPlaceSelect: vi.fn(),
    }
    render(<MemoryRouter><MapPage {...props} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')

    fireEvent.click(screen.getByRole('button', { name: 'Mesurer une distance' }))
    expect(map).toHaveAttribute('data-measurement-active', 'true')
    const measurementPanel = screen.getByRole('region', { name: 'Mesure de distance' })
    expect(measurementPanel).toHaveTextContent('0 m')
    expect(getComputedStyle(measurementPanel).pointerEvents).toBe('auto')

    fireEvent.click(screen.getByRole('button', { name: 'Simuler un clic de mesure' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simuler un clic de mesure' }))
    expect(map).toHaveAttribute('data-measurement-points', '2')
    expect(screen.getByRole('region', { name: 'Mesure de distance' })).toHaveTextContent('2 points')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le dernier point' }))
    expect(map).toHaveAttribute('data-measurement-points', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la mesure' }))
    expect(map).toHaveAttribute('data-measurement-points', '0')

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitter le mode mesure' })[0])
    expect(map).toHaveAttribute('data-measurement-active', 'false')
    expect(screen.queryByRole('region', { name: 'Mesure de distance' })).not.toBeInTheDocument()
  })
})
