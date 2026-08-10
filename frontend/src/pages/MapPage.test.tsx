import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useContext, useState } from 'react'

import { MapPage } from './MapPage'
import { MapMarkerFilterContext } from '../components/map/mapMarkerFilterContext'
import { RESET_DESKTOP_PANEL_LAYOUT_EVENT } from '../components/layout/FloatingPanelWindow'

const themeState = vi.hoisted(() => ({
  resolvedTheme: 'light' as 'light' | 'dark',
  setPreference: vi.fn(),
}))
const getPlaceDetails = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'remote-selected', latitude: 45, longitude: 9 }))
const annotationApi = vi.hoisted(() => ({
  createPlaceAnnotation: vi.fn().mockResolvedValue({ id: 'annotation-id' }),
  getPlaceAnnotations: vi.fn().mockResolvedValue([]),
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
  getAccountPreferences: vi.fn().mockResolvedValue({ language: 'fr', preferred_basemap: 'cartavault-light', density: 'comfortable', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm' }, places: { provider: 'stadia' } }),
  updateAccountPreferences: vi.fn().mockImplementation(async (preferences) => preferences),
}))

vi.mock('../api/places', () => ({ getPlaceDetails }))
vi.mock('../api/annotations', () => annotationApi)

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ layoutKey, basemapId, onBasemapTileError, countryId, countryMaskEnabled, measurementActive, measurementPoints, onMeasurementPointAdd, mapToolMode, onTemporaryExtentChange, onTemporaryCoordinateChange, focusRequest, annotationDrawing, onAnnotationDrawingPointsChange, onAnnotationDrawingComplete }: { layoutKey: string; basemapId: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm'; onBasemapTileError: (id: 'cartavault-light' | 'cartavault-dark' | 'satellite' | 'osm') => void; countryId?: string | null; countryMaskEnabled?: boolean; measurementActive?: boolean; measurementPoints?: Array<{ latitude: number; longitude: number }>; onMeasurementPointAdd?: (point: { latitude: number; longitude: number }) => void; mapToolMode?: string; onTemporaryExtentChange?: (extent: { start: { latitude: number; longitude: number }; end: { latitude: number; longitude: number }; locked: boolean }) => void; onTemporaryCoordinateChange?: (point: { latitude: number; longitude: number }) => void; focusRequest?: { bounds?: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number } } | null; annotationDrawing?: { points: Array<{ latitude: number; longitude: number }> } | null; onAnnotationDrawingPointsChange?: (points: Array<{ latitude: number; longitude: number }>) => void; onAnnotationDrawingComplete?: (points: Array<{ latitude: number; longitude: number }>) => void }) => (
    <div data-testid="poi-map" data-layout-key={layoutKey} data-basemap-id={basemapId} data-country-id={countryId ?? ''} data-country-mask={String(countryMaskEnabled)} data-measurement-active={String(measurementActive)} data-measurement-points={measurementPoints?.length ?? 0} data-tool-mode={mapToolMode} data-focus-bounds={focusRequest?.bounds ? JSON.stringify(focusRequest.bounds) : ''} data-annotation-points={annotationDrawing?.points.length ?? 0}>
      <button type="button" onClick={() => onBasemapTileError(basemapId)}>Simuler l'erreur de tuiles</button>
      <button type="button" onClick={() => onMeasurementPointAdd?.({ latitude: 48.8566, longitude: 2.3522 })}>Simuler un clic de mesure</button>
      <button type="button" onClick={() => onTemporaryExtentChange?.({ start: { latitude: 47, longitude: 1 }, end: { latitude: 49, longitude: 3 }, locked: true })}>Simuler une emprise</button>
      <button type="button" onClick={() => onTemporaryCoordinateChange?.({ latitude: 48.1234567, longitude: 2.7654321 })}>Simuler des coordonnées</button>
      <button type="button" onClick={() => { const points = [{ latitude: 48, longitude: 2 }, { latitude: 48.1, longitude: 2.1 }]; onAnnotationDrawingPointsChange?.(points); onAnnotationDrawingComplete?.(points) }}>Simuler un dessin d’annotation</button>
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
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
})

function InteractiveModeHarness() {
  const [selectionMode, setSelectionMode] = useState(true)
  return <MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} placeSelectionMode={selectionMode} onPlaceSelectionModeChange={setSelectionMode} /></MemoryRouter>
}

function StatusFilterSetter() {
  const { setFilter } = useContext(MapMarkerFilterContext)
  return <button type="button" onClick={() => setFilter({ query: '', categoryId: '', statusId: 'todo', tagId: '' })}>Activer le filtre de test</button>
}

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
    expect(map).toHaveAttribute('data-layout-key', 'true-true-0')
    expect(screen.getByLabelText('Liste de test')).toBeVisible()
    expect(screen.getByLabelText('Volet de test')).toBeVisible()
    const placeDetail = screen.getByRole('complementary', { name: 'Détails du lieu sélectionné' })
    expect(placeDetail).toHaveTextContent('Détails du lieu')
    expect(placeDetail.closest('.cv-floating-panel-window--detail')).toHaveStyle({ height: '620px' })
    expect(placeDetail.closest('.map-layout')).toBeInTheDocument()
    expect(screen.getByLabelText('Éditeur du lieu')).toContainElement(screen.getByLabelText('Volet de test'))
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
    const placesWindow = screen.getByLabelText('Panneau de navigation')
    const tripsWindow = screen.getByLabelText('Panneau Sortie')
    const placesWidth = Number.parseFloat(placesWindow.style.width)
    const tripsWidth = Number.parseFloat(tripsWindow.style.width)
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })).toHaveAttribute('aria-valuemin', '420')
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })).not.toHaveAttribute('aria-valuemax')

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau de navigation' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' }), { key: 'ArrowRight' })

    expect(workspace.style.getPropertyValue('--cv-left-panel-width')).toBe(`${placesWidth + 24}px`)
    expect(workspace.style.getPropertyValue('--cv-right-panel-width')).toBe(`${tripsWidth + 24}px`)
    expect(window.localStorage.getItem('cartavault:left-panel-width')).toBe(String(placesWidth + 24))
    expect(window.localStorage.getItem('cartavault:right-panel-width')).toBe(String(tripsWidth + 24))
    expect(screen.getByTestId('poi-map')).toBe(map)
  })

  it('toggles between the responsive default layout and the saved custom geometry', async () => {
    window.localStorage.setItem('cartavault:desktop-places-window', JSON.stringify({ x: 44, y: 30, width: 390, height: 540 }))
    window.localStorage.setItem('cartavault:desktop-trips-window', JSON.stringify({ x: 470, y: 48, width: 520, height: 610 }))
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen tripPlanningActive placeListOpen statuses={[]} sidebar={<aside>Sorties</aside>} placeList={<aside>Lieux</aside>} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    const workspace = screen.getByTestId('poi-map').closest('.map-workspace') as HTMLElement
    Object.defineProperty(workspace, 'clientWidth', { configurable: true, value: 1200 })
    Object.defineProperty(workspace, 'clientHeight', { configurable: true, value: 800 })
    fireEvent(window, new Event(RESET_DESKTOP_PANEL_LAYOUT_EVENT))

    const placesWindow = screen.getByLabelText('Panneau de navigation')
    const tripsWindow = screen.getByLabelText('Panneau Sortie')
    await waitFor(() => expect(placesWindow.style.left).toBe('12px'))
    expect(Number.parseFloat(tripsWindow.style.left) + Number.parseFloat(tripsWindow.style.width)).toBeLessThan(1188)
    expect(window.localStorage.getItem('cartavault:desktop-panel-layout-mode')).toBe('default')
    expect(placesWindow).toHaveClass('is-locked')
    expect(tripsWindow).toHaveClass('is-locked')
    expect(screen.queryByRole('separator', { name: 'Redimensionner le panneau Sorties' })).not.toBeInTheDocument()

    fireEvent(window, new Event(RESET_DESKTOP_PANEL_LAYOUT_EVENT))
    await waitFor(() => expect(placesWindow.style.left).toBe('44px'))
    expect(placesWindow.style.width).toBe('390px')
    expect(tripsWindow.style.left).toBe('470px')
    expect(tripsWindow.style.height).toBe('610px')
    expect(window.localStorage.getItem('cartavault:desktop-panel-layout-mode')).toBe('custom')
    expect(placesWindow).not.toHaveClass('is-locked')
    expect(tripsWindow).not.toHaveClass('is-locked')
    expect(screen.getByRole('separator', { name: 'Redimensionner le panneau Sorties' })).toBeInTheDocument()
  })

  it('ignores saved custom geometry while the default layout is locked', () => {
    window.localStorage.setItem('cartavault:desktop-panel-layout-mode', 'default')
    window.localStorage.setItem('cartavault:desktop-places-window', JSON.stringify({ x: 144, y: 130, width: 390, height: 540 }))
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen placeListOpen statuses={[]} sidebar={<aside aria-label="Éditeur natif">Éditeur</aside>} popupContent={<article>Fiche verrouillée</article>} placeList={<aside>Lieux</aside>} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    const placesWindow = screen.getByLabelText('Panneau de navigation')
    expect(placesWindow).toHaveClass('is-locked')
    expect(placesWindow.style.left).toBe('12px')
    expect(placesWindow.style.top).toBe('12px')
    expect(screen.queryByRole('separator', { name: 'Redimensionner le panneau de navigation' })).not.toBeInTheDocument()
    const lockedDetail = screen.getByRole('complementary', { name: 'Détails du lieu sélectionné' })
    expect(lockedDetail.closest('.cv-floating-panel-window')).toBeNull()
    expect(lockedDetail.parentElement).toHaveClass('map-layout')
    expect(screen.getByLabelText('Éditeur natif').closest('.cv-floating-panel-window')).toBeNull()
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

    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mesurer' }))
    expect(map).toHaveAttribute('data-measurement-active', 'true')
    expect(screen.getByText('Distance totale').parentElement).toHaveTextContent('0 m')

    fireEvent.click(screen.getByRole('button', { name: 'Simuler un clic de mesure' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simuler un clic de mesure' }))
    expect(map).toHaveAttribute('data-measurement-points', '2')
    expect(screen.getByText('Distance totale').parentElement).toHaveTextContent('2 points')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le dernier point' }))
    expect(map).toHaveAttribute('data-measurement-points', '1')
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les outils' }))
    expect(map).toHaveAttribute('data-measurement-points', '0')
    expect(map).toHaveAttribute('data-measurement-active', 'false')
    expect(screen.queryByText('Distance totale')).not.toBeInTheDocument()
  })

  it('closes point selection before enabling an incompatible map tool', async () => {
    render(<InteractiveModeHarness />)
    const map = await screen.findByTestId('poi-map')
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    expect(screen.getByText('La sélection multiple est active.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Mesurer' }))
    await waitFor(() => expect(map).toHaveAttribute('data-tool-mode', 'measurement'))
    expect(map).toHaveAttribute('data-measurement-active', 'true')
    expect(screen.queryByText('La sélection multiple est active.')).not.toBeInTheDocument()
  })

  it('previews an area, selects only contained visible POIs, and supports fit actions', async () => {
    const inside = { id: 'inside', map_id: 'map', name: 'Dedans', latitude: 48, longitude: 2, status: { id: 'todo', color: '#0FA68A' }, primary_category_icon: null, category_ids: [], tag_ids: [], is_favorite: false }
    const outside = { ...inside, id: 'outside', name: 'Dehors', latitude: 50, longitude: 5 }
    const filteredInside = { ...inside, id: 'filtered-inside', name: 'Masqué par le filtre', latitude: 48.5, longitude: 2.5, status: { id: 'done', color: '#2563EB' } }
    const apply = vi.fn()
    const selectionMode = vi.fn()
    render(<MemoryRouter><MapPage places={[inside, outside, filteredInside]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={<StatusFilterSetter />} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} onAreaSelectionApply={apply} onPlaceSelectionModeChange={selectionMode} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')
    fireEvent.click(screen.getByRole('button', { name: 'Activer le filtre de test' }))

    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner une zone' }))
    expect(map).toHaveAttribute('data-tool-mode', 'area-selection')
    fireEvent.click(screen.getByRole('button', { name: 'Simuler une emprise' }))
    expect(screen.getByText('1 lieu dans la zone')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la sélection' }))
    expect(apply).toHaveBeenCalledWith(['inside'], 'replace')
    expect(selectionMode).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Lieux visibles' }))
    expect(map.getAttribute('data-focus-bounds')).toContain('"minLatitude":48')
    expect(map.getAttribute('data-focus-bounds')).toContain('"maxLatitude":50')
  })

  it('fits selected POIs even when their marker is outside the currently loaded bounds', async () => {
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} selectedPlaceIds={new Set(['remote-selected'])} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sélection' }))
    await waitFor(() => expect(map.getAttribute('data-focus-bounds')).toContain('"minLatitude":45'))
    expect(getPlaceDetails).toHaveBeenCalledWith('remote-selected', expect.any(AbortSignal))
  })

  it('requests geolocation only after an explicit user action', async () => {
    const getCurrentPosition = vi.fn()
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await screen.findByTestId('poi-map')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Me localiser' }))
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 })
  })

  it('copies stable coordinates and can create a place at the chosen point', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const create = vi.fn()
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} onCreateFromCoordinates={create} /></MemoryRouter>)
    await screen.findByTestId('poi-map')
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Coordonnées' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simuler des coordonnées' }))
    expect(screen.getByText('48.123457, 2.765432')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(writeText).toHaveBeenCalledWith('48.123457, 2.765432')
    fireEvent.click(screen.getByRole('button', { name: 'Créer ici' }))
    expect(create).toHaveBeenCalledWith(48.1234567, 2.7654321)
  })

  it('cancels a temporary action with Escape', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dessiner une emprise' }))
    fireEvent.click(screen.getByRole('button', { name: 'Simuler une emprise' }))
    expect(map).toHaveAttribute('data-tool-mode', 'extent-drawing')
    expect(screen.getByText('Surface')).toBeVisible()
    expect(screen.getByText('Dimensions')).toBeVisible()
    expect(screen.getByText('Périmètre')).toBeVisible()
    expect(screen.queryByText(/lieu dans la zone/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copier le GeoJSON' }))
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      type: 'Polygon',
      coordinates: [[[1, 47], [3, 47], [3, 49], [1, 49], [1, 47]]],
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(map).toHaveAttribute('data-tool-mode', 'navigation')
    expect(screen.queryByText('Mesure géométrique temporaire')).not.toBeInTheDocument()
  })

  it('requests full screen for the map area and restores its layout on exit', async () => {
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    const map = await screen.findByTestId('poi-map')
    const mapArea = screen.getByLabelText("Carte des points d'intérêt")
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(mapArea, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    fireEvent.click(screen.getByRole('button', { name: 'Outils cartographiques' }))
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }))
    expect(requestFullscreen).toHaveBeenCalledOnce()
    const previousLayoutKey = map.getAttribute('data-layout-key')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: mapArea })
    fireEvent(document, new Event('fullscreenchange'))
    expect(map.getAttribute('data-layout-key')).not.toBe(previousLayoutKey)
    expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toBeVisible()
  })

  it('keeps an annotation drawing as a draft until the user validates it', async () => {
    render(<MemoryRouter><MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 8 }} isLoading={false} errorMessage={null} sidebarOpen={false} placeListOpen={false} statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await screen.findByTestId('poi-map')

    fireEvent(window, new CustomEvent('cartavault:annotation-draw-requested', { detail: {
      placeId: 'place-id',
      title: 'Zone visiteurs',
      template: { id: 'template-id', map_id: 'map-id', name: 'Parking', shape_type: 'rectangle', icon: 'tabler:map-pin', color: '#dc2626', sort_order: 0, is_active: true, usage_count: 0 },
    } }))

    expect(await screen.findByRole('region', { name: 'Contrôles du dessin d’annotation' })).toHaveTextContent('glissez sur la carte')
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simuler un dessin d’annotation' }))

    expect(await screen.findByRole('button', { name: 'Valider' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refaire' })).toBeVisible()
    expect(annotationApi.createPlaceAnnotation).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Refaire' }))
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-annotation-points', '0')

    fireEvent.click(screen.getByRole('button', { name: 'Simuler un dessin d’annotation' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(annotationApi.createPlaceAnnotation).toHaveBeenCalledWith('place-id', {
      template_id: 'template-id',
      geometry: { type: 'Polygon', coordinates: [[[2, 48], [2.1, 48], [2.1, 48.1], [2, 48.1], [2, 48]]] },
      title: 'Zone visiteurs',
    }))
  })

  it('portals mobile place details above workspace panels instead of raising the map', () => {
    render(
      <MemoryRouter>
        <MapPage
          places={[]}
          selectedPlaceId="place-1"
          initialView={{ center: [48, 2], zoom: 8 }}
          isLoading={false}
          errorMessage={null}
          sidebarOpen
          placeListOpen
          statuses={[]}
          sidebar={<aside aria-label="Sortie">Sortie</aside>}
          placeList={null}
          popupContent={<article>Fiche du POI</article>}
          mobilePlaceDetailOpen
          focusRequest={null}
          onBoundsChange={vi.fn()}
          onViewChange={vi.fn()}
          onPlaceSelect={vi.fn()}
        />
      </MemoryRouter>,
    )

    const detail = screen.getByRole('complementary', { name: 'Détails du lieu sélectionné' })
    expect(detail).toHaveTextContent('Fiche du POI')
    expect(detail.parentElement).toHaveClass('mobile-place-detail-layer')
    expect(detail.closest('.map-layout')).toBeNull()
    expect(screen.getByLabelText('Sortie')).toBeInTheDocument()
  })
})
