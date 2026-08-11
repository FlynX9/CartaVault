import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from './api/client'
import { deleteMap, getMaps } from './api/maps'
import { getMapPlaces, getPlaceDetails } from './api/places'
import App from './App'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn(), getMapProfiles: vi.fn(() => Promise.resolve([])), getPendingMapInvitations: vi.fn(() => Promise.resolve([])), acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn() }))
vi.mock('./api/setup', () => ({ getSetupStatus: vi.fn(() => Promise.resolve({ required: false, locked: true, checks: [] })) }))
vi.mock('./api/users', () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, is_active: true }, loading: false, logout: vi.fn(), refresh: vi.fn(), login: vi.fn() }) }))
vi.mock('./auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve({ items: [], total: 0, returned: 0, truncated: false })), getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: false, index: null, page: null, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn(), getPlaceDetails: vi.fn(() => Promise.resolve({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, status: { id: 'status-id', color: '#2563EB' }, categories: [], tags: [], is_favorite: false })) }))
vi.mock('./components/map-popup/PlaceMapPopup', () => ({ PlaceMapPopup: ({ placeId, showManagementActions, onClose }: { placeId: string; showManagementActions?: boolean; onClose: () => void }) => <div role="dialog" data-management-actions={String(showManagementActions)}>Popup {placeId}<button onClick={onClose}>Fermer popup</button></div> }))
vi.mock('./components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('./components/trips/TripPlannerPanel', () => ({ TripPlannerPanel: ({ tripViewOnly = false, onTripViewOnlyChange, onTripChange, onPreviewStopSelect, onUnsavedChangesGuardChange }: { tripViewOnly?: boolean; onTripViewOnlyChange: (enabled: boolean) => void; onTripChange: (trip: never) => void; onPreviewStopSelect?: (stopId: string | null) => void; onUnsavedChangesGuardChange?: (guard: (() => Promise<boolean>) | null) => void }) => <aside aria-label="Préparation de sortie" data-trip-view={String(tripViewOnly)}><button type="button" onClick={() => onTripViewOnlyChange(true)}>Vue du voyage</button><button type="button" onClick={() => onTripChange({ id: 'trip-1', map_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_by_user_id: 'user-id', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [{ id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed', safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: null, route_duration_seconds: null, visit_duration_minutes: 60, total_duration_minutes: 60, route_geometry: null, route_segments: null, route_status: null, sort_order: 0, stops: [{ id: 'stop-place', trip_day_id: 'day-1', place_id: 'place-id', stop_type: 'place', name: 'POI', latitude: 48, longitude: 2, address: 'Adresse POI', sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' }, { id: 'stop-free', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location', name: 'Belvédère libre', latitude: 48.1, longitude: 2.1, address: 'Route des Crêtes', sort_order: 1, visit_duration_minutes: 30, notes: 'Masquée', is_required: true, is_locked: false, visit_status: 'planned' }] }] } as never)}>Charger une sortie</button><button type="button" onClick={() => onPreviewStopSelect?.('stop-place')}>Sélectionner l’étape POI</button><button type="button" onClick={() => onPreviewStopSelect?.('stop-free')}>Sélectionner l’étape libre</button><button type="button" onClick={() => onUnsavedChangesGuardChange?.(() => Promise.resolve(false))}>Simuler des modifications</button></aside> }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ places, errorMessage, placeList, sidebar, popupContent, focusRequest, selectedPlaceId, onPlaceSelect, onBoundsChange }: { places: Array<{ id: string; name: string }>; errorMessage: string | null; placeList: ReactNode; sidebar: ReactNode; popupContent: ReactNode; focusRequest: { id: number } | null; selectedPlaceId: string | null; onPlaceSelect: (place: never) => void; onBoundsChange: (bounds: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }) => void }) => <div data-testid="workspace" data-focus={focusRequest?.id ?? ''} data-selected={selectedPlaceId ?? ''} data-markers={places.map((place) => place.name).join(',')}><button onClick={() => onPlaceSelect({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] } as never)}>Marqueur POI</button><button onClick={() => onBoundsChange({ minLatitude: 40, maxLatitude: 50, minLongitude: -5, maxLongitude: 5 })}>Bounds A</button><button onClick={() => onBoundsChange({ minLatitude: 41, maxLatitude: 49, minLongitude: -4, maxLongitude: 4 })}>Bounds B</button>{errorMessage && <p data-testid="map-error">{errorMessage}</p>}{placeList}{popupContent}{sidebar}</div> }))
vi.mock('./components/dashboard/DashboardPage', () => ({ DashboardPage: () => <div>Dashboard</div> }))

const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MAP = { id: MAP_ID, name: 'Carte France', country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', country: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46.2, effective_center_longitude: 2.2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', place_count: 0, trip_count: 0 }

function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}{location.search}</output> }
function BrowserBack() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(-1)}>Précédent</button> }

beforeEach(() => vi.mocked(getMaps).mockResolvedValue([MAP]))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('map URL workspace', () => {
  it('cancels obsolete bounds requests and retains usable markers during refresh failures', async () => {
    let resolveFirst!: (value: never) => void
    let resolveSecond!: (value: never) => void
    let rejectThird!: (reason: Error) => void
    vi.mocked(getMapPlaces)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectThird = reject }))

    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))
    fireEvent.click(await screen.findByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(1))
    const firstSignal = vi.mocked(getMapPlaces).mock.calls[0]?.[1]

    fireEvent.click(screen.getByRole('button', { name: 'Bounds B' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      resolveFirst({ items: [{ id: 'old', name: 'Ancien' }], total: 1, returned: 1, truncated: false } as never)
      resolveSecond({ items: [{ id: 'current', map_id: MAP_ID, name: 'Actuel', latitude: 48, longitude: 2, status: { id: 'status', color: '#2563EB' }, primary_category_icon: null, category_ids: [], tag_ids: [], is_favorite: false }], total: 1, returned: 1, truncated: false } as never)
    })
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-markers', 'Actuel'))

    fireEvent.click(screen.getByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(3))
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-markers', 'Actuel')
    await act(async () => rejectThird(new Error('Marker API unavailable')))

    expect(await screen.findByTestId('map-error')).toHaveTextContent('Marker API unavailable')
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-markers', 'Actuel')
  })

  it('keeps authenticated users away from authentication pages in browser history', async () => {
    render(
      <MemoryRouter initialEntries={['/login', '/dashboard']} initialIndex={1}>
        <App />
        <Path />
        <BrowserBack />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Dashboard')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'))
    expect(screen.queryByRole('heading', { name: 'Connexion à CartaVault' })).not.toBeInTheDocument()
  })

  it('redirects an authenticated user away from registration pages', async () => {
    render(<MemoryRouter initialEntries={['/register']}><App /><Path /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'))
    expect(screen.queryByRole('heading', { name: /Créer un compte/ })).not.toBeInTheDocument()
  })

  it('restores a map UUID without the former top bar selector', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    expect(screen.queryByRole('combobox', { name: 'Carte' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))
  })

  it('opens the maps panel and starts creation from its dedicated button', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`))
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(await screen.findByRole('heading', { name: 'Cartes' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Créer une carte' }))
    expect(screen.getByRole('heading', { name: 'Créer une carte' })).toBeVisible()
  })

  it('collapses and restores the Places panel when its active navigation entry is clicked again', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    const placesNavigation = await screen.findByRole('button', { name: 'Lieux' })

    fireEvent.click(placesNavigation)
    expect(await screen.findByRole('button', { name: 'Déployer le panneau Lieux' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Lieux' })).toBeVisible()

    fireEvent.click(placesNavigation)
    expect(await screen.findByRole('button', { name: 'Réduire le panneau Lieux' })).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).toBeVisible()
  })

  it('opens administration as a routed modal over the persistent map', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/users'))
    expect(await screen.findByRole('dialog', { name: 'Administration' })).toBeVisible()
    expect(screen.getByTestId('workspace')).toBeVisible()
    const mapCallsBeforeSectionChange = vi.mocked(getMaps).mock.calls.length
    fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Clés API' })).toBeVisible()
    expect(getMaps).toHaveBeenCalledTimes(mapCallsBeforeSectionChange)
    fireEvent.click(screen.getByRole('link', { name: 'Quotas' }))
    expect(await screen.findByRole('heading', { name: 'Quotas' })).toBeVisible()
    expect(getMaps).toHaveBeenCalledTimes(mapCallsBeforeSectionChange)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`))
  })

  it('always opens Sorties with the complete Places and Preparation workspace', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Sorties' }))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(await screen.findByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-management-actions', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Vue du voyage' }))
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'true')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Rechercher un lieu' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    expect(screen.queryByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(await screen.findByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).toBeVisible()
  })

  it('keeps the active trip when returning from another workspace', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Sorties' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Charger une sortie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sélectionner l’étape POI' }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
  })

  it('opens the timeline when the active Sorties navigation is tapped again on mobile', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query === '(max-width: 760px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)

    const tripsNavigation = await screen.findByRole('button', { name: 'Sorties' })
    fireEvent.click(tripsNavigation)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')

    fireEvent.click(tripsNavigation)
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'true')

    fireEvent.click(tripsNavigation)
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
  })

  it('opens linked and free stop cards from the trip timeline without changing its fitted map view', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Sorties' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Charger une sortie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vue du voyage' }))
    const fittedFocus = screen.getByTestId('workspace').getAttribute('data-focus')

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner l’étape POI' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', fittedFocus ?? '')

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner l’étape libre' }))
    expect(await screen.findByRole('heading', { name: 'Belvédère libre' })).toBeVisible()
    expect(screen.getByText('Route des Crêtes')).toBeVisible()
    expect(screen.queryByText('Masquée')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', fittedFocus ?? '')
  })

  it('returns to the Places workspace when Lieux is selected from Sorties', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Sorties' }))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))

    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).toBeVisible()
  })

  it('keeps the trip workspace open when unsaved settings cancel main navigation', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Sorties' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Simuler des modifications' }))
    fireEvent.click(screen.getByRole('button', { name: 'Catégories' }))

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Catégories' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports an API failure when moving a map to trash', async () => {
    vi.mocked(deleteMap).mockRejectedValue(new ApiError(409, 'Conflict'))
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cartes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Carte France' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict')
  })

  it('opens a marker in the map popup and closes back to the active map URL', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    expect(screen.getByRole('dialog')).toHaveAttribute('data-management-actions', 'true')
    expect(screen.getByTestId('path')).toHaveTextContent(`/places/place-id?map=${MAP_ID}`)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`)
  })

  it('centers a POI only when its popup opens and preserves manual map navigation', async () => {
    vi.mocked(getMapPlaces).mockResolvedValue({ items: [], total: 0, returned: 0, truncated: false })
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))

    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    await waitFor(() => expect(getPlaceDetails).toHaveBeenCalledWith('place-id', expect.any(AbortSignal)))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    const popupFocus = screen.getByTestId('workspace').getAttribute('data-focus')

    fireEvent.click(screen.getByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalled())

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', popupFocus ?? '')
  })

  it('restores a direct place URL inside the map workspace', async () => {
    render(<MemoryRouter initialEntries={[`/places/place-id?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    expect(screen.getByTestId('workspace')).toBeVisible()
  })

  it('removes a revoked active map when access is refreshed', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    await waitFor(() => expect(getMaps).toHaveBeenCalled())
    const callsBeforeRevocation = vi.mocked(getMaps).mock.calls.length
    vi.mocked(getMaps).mockResolvedValue([])

    fireEvent.focus(window)

    await waitFor(() => expect(getMaps).toHaveBeenCalledTimes(callsBeforeRevocation + 1))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/))
  })

  it('refreshes map access silently without hiding the current catalog', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(getMaps).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(await screen.findByRole('button', { name: 'Carte France est ouverte' })).toBeVisible()

    let resolveRefresh!: (maps: typeof MAP[]) => void
    vi.mocked(getMaps).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve }))
    fireEvent.focus(window)

    expect(screen.getByRole('button', { name: 'Carte France est ouverte' })).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    resolveRefresh([MAP])
  })

  it('does not restore an aborted direct URL selection after closing the popup', async () => {
    let resolveDetails!: (place: never) => void
    vi.mocked(getPlaceDetails).mockImplementationOnce(() => new Promise((resolve) => { resolveDetails = resolve }))
    render(<MemoryRouter initialEntries={[`/places/place-id?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`)
    resolveDetails({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] } as never)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-selected', ''))
  })
})
