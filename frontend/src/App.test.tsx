import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from './api/client'
import { deleteMap, getMaps } from './api/maps'
import { getMapPlaces, getPlaceDetails } from './api/places'
import { getTrip } from './api/trips'
import App from './App'
import { MOBILE_NAVIGATION_MEDIA_QUERY } from './components/layout/mobileNavigationViewport'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn(), getMapProfiles: vi.fn(() => Promise.resolve([])), getPendingMapInvitations: vi.fn(() => Promise.resolve([])), acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn() }))
vi.mock('./api/setup', () => ({ getSetupStatus: vi.fn(() => Promise.resolve({ required: false, locked: true, checks: [] })) }))
vi.mock('./api/users', () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, is_active: true }, loading: false, logout: vi.fn(), refresh: vi.fn(), login: vi.fn() }) }))
vi.mock('./auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve({ items: [], total: 0, returned: 0, truncated: false })), getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: false, index: null, page: null, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn(), getPlaceDetails: vi.fn(() => Promise.resolve({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, status: { id: 'status-id', color: '#2563EB' }, categories: [], tags: [], is_favorite: false })) }))
vi.mock('./api/trips', () => ({ getTrip: vi.fn(), listTrips: vi.fn(() => Promise.resolve([])), listAccessibleTrips: vi.fn(() => Promise.resolve([])), restoreTripState: vi.fn() }))
vi.mock('./components/map-popup/PlaceMapPopup', () => ({ PlaceMapPopup: ({ placeId, showManagementActions, onClose, variant }: { placeId: string; showManagementActions?: boolean; onClose: () => void; variant?: string }) => <div role={variant === 'inline' ? 'region' : 'dialog'} aria-label={variant === 'inline' ? `Détails inline ${placeId}` : undefined} data-management-actions={String(showManagementActions)}>Popup {placeId}<button onClick={onClose}>Fermer popup</button></div> }))
vi.mock('./components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('./components/trips/TripPlannerPanel', () => ({ TripPlannerPanel: ({ tripViewOnly = false, onTripViewOnlyChange, onTripChange, onPreviewStopSelect, onUnsavedChangesGuardChange }: { tripViewOnly?: boolean; onTripViewOnlyChange: (enabled: boolean) => void; onTripChange: (trip: never) => void; onPreviewStopSelect?: (stopId: string | null) => void; onUnsavedChangesGuardChange?: (guard: (() => Promise<boolean>) | null) => void }) => <aside aria-label="Préparation de sortie" data-trip-view={String(tripViewOnly)}><button type="button" onClick={() => onTripViewOnlyChange(true)}>Vue du voyage</button><button type="button" onClick={() => onTripChange({ id: 'trip-1', map_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_by_user_id: 'user-id', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [{ id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed', safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: null, route_duration_seconds: null, visit_duration_minutes: 60, total_duration_minutes: 60, route_geometry: null, route_segments: null, route_status: null, sort_order: 0, stops: [{ id: 'stop-place', trip_day_id: 'day-1', place_id: 'place-id', stop_type: 'place', name: 'POI', latitude: 48, longitude: 2, address: 'Adresse POI', sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' }, { id: 'stop-free', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location', name: 'Belvédère libre', latitude: 48.1, longitude: 2.1, address: 'Route des Crêtes', sort_order: 1, visit_duration_minutes: 30, notes: 'Masquée', is_required: true, is_locked: false, visit_status: 'planned' }] }] } as never)}>Charger une sortie</button><button type="button" onClick={() => onPreviewStopSelect?.('stop-place')}>Sélectionner l’étape POI</button><button type="button" onClick={() => onPreviewStopSelect?.('stop-free')}>Sélectionner l’étape libre</button><button type="button" onClick={() => onUnsavedChangesGuardChange?.(() => Promise.resolve(false))}>Simuler des modifications</button></aside> }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ places, errorMessage, mapOpening, placeList, sidebar, popupContent, desktopPlaceDetailInline, focusRequest, selectedPlaceId, onPlaceSelect, onBoundsChange }: { places: Array<{ id: string; name: string }>; errorMessage: string | null; mapOpening?: boolean; placeList: ReactNode; sidebar: ReactNode; popupContent: ReactNode; desktopPlaceDetailInline?: boolean; focusRequest: { id: number } | null; selectedPlaceId: string | null; onPlaceSelect: (place: never) => void; onBoundsChange: (bounds: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }) => void }) => {
  return <div data-testid="workspace" data-focus={focusRequest?.id ?? ''} data-selected={selectedPlaceId ?? ''} data-markers={places.map((place) => place.name).join(',')} data-map-opening={String(mapOpening === true)}><button onClick={() => onPlaceSelect({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] } as never)}>Marqueur POI</button><button onClick={() => onBoundsChange({ minLatitude: 40, maxLatitude: 50, minLongitude: -5, maxLongitude: 5 })}>Bounds A</button><button onClick={() => onBoundsChange({ minLatitude: 41, maxLatitude: 49, minLongitude: -4, maxLongitude: 4 })}>Bounds B</button>{errorMessage && <p data-testid="map-error">{errorMessage}</p>}{placeList}{!desktopPlaceDetailInline && popupContent}{sidebar}</div>
} }))
vi.mock('./components/dashboard/DashboardPage', () => ({ DashboardPage: () => <div>Dashboard</div> }))
vi.mock('./api/adminConsole', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api/adminConsole')>(),
  getMediaUploadSettings: vi.fn(() => Promise.resolve({ max_upload_megabytes: 5, max_image_dimension: 2560 })),
}))

const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MAP = { id: MAP_ID, name: 'Carte France', country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', country: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46.2, effective_center_longitude: 2.2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', place_count: 0, trip_count: 0 }
const MAP_ID_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MAP_B = { ...MAP, id: MAP_ID_B, name: 'Carte Italie', country: { ...MAP.country, iso_alpha2: 'IT', iso_alpha3: 'ITA', name: 'Italie' } }
const TRIP = { id: 'trip-1', map_id: MAP_ID, created_by_user_id: 'user-id', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [{ id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed', safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: null, route_duration_seconds: null, visit_duration_minutes: 0, total_duration_minutes: 0, route_geometry: null, route_segments: null, route_status: null, sort_order: 0, stops: [] }] } as never

function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}{location.search}</output> }
function BrowserBack() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(-1)}>Précédent</button> }
function BrowserForward() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate(1)}>Suivant</button> }

beforeEach(() => {
  vi.mocked(getMaps).mockResolvedValue([MAP])
  vi.mocked(getTrip).mockResolvedValue(TRIP)
  vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, status: { id: 'status-id', color: '#2563EB' }, categories: [], tags: [], is_favorite: false } as never)
})
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('map URL workspace', () => {
  it('cancels obsolete bounds requests and retains usable markers during refresh failures', async () => {
    // Bounds requests are debounced (250 ms); allow headroom so the sequence
    // stays deterministic when the whole suite runs under heavy parallel load.
    const debounceWait = { timeout: 5000 }
    let resolveFirst!: (value: never) => void
    let resolveSecond!: (value: never) => void
    let rejectThird!: (reason: Error) => void
    vi.mocked(getMapPlaces)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectThird = reject }))

    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'), debounceWait)
    fireEvent.click(await screen.findByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(1), debounceWait)
    const firstSignal = vi.mocked(getMapPlaces).mock.calls[0]?.[1]

    fireEvent.click(screen.getByRole('button', { name: 'Bounds B' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(2), debounceWait)
    expect(firstSignal?.aborted).toBe(true)

    await act(async () => {
      resolveFirst({ items: [{ id: 'old', name: 'Ancien' }], total: 1, returned: 1, truncated: false } as never)
      resolveSecond({ items: [{ id: 'current', map_id: MAP_ID, name: 'Actuel', latitude: 48, longitude: 2, status: { id: 'status', color: '#2563EB' }, primary_category_icon: null, category_ids: [], tag_ids: [], is_favorite: false }], total: 1, returned: 1, truncated: false } as never)
    })
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-markers', 'Actuel'), debounceWait)

    fireEvent.click(screen.getByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(3), debounceWait)
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
    expect(document.getElementById('map-context-toolbar-slot')?.closest('nav')).toHaveAccessibleName('Navigation de la carte')
  })

  it('replaces legacy map query context while retaining filters', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}&q=musée`]}><App /><Path /></MemoryRouter>)

    // The browser canonical form percent-encodes non-ASCII query values.
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}?q=mus%C3%A9e`))
  })

  it('does not automatically open a map when the URL has no map context', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'))
    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    expect(await screen.findByRole('heading', { name: 'Mes cartes' })).toBeVisible()
  })

  it('keeps a closed map out of subsequent navigation', async () => {
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    await screen.findByTestId('workspace')

    // The close entry only exists once the map catalog has loaded.
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer Carte France' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/maps'))
    fireEvent.click(screen.getByRole('button', { name: 'Accueil' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'))
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument()
  })

  it('reopens an already-open map after Mes Cartes without losing its initial bounds', async () => {
    const pendingRequests: Array<() => void> = []
    vi.mocked(getMapPlaces).mockImplementation(() => new Promise((resolve) => {
      pendingRequests.push(() => resolve({ items: [], total: 0, returned: 0, truncated: false }))
    }))
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}`]}><App /></MemoryRouter>)

    await screen.findByTestId('workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(1))
    await act(async () => pendingRequests[0]?.())
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-map-opening', 'false'))
    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    expect(await screen.findByRole('heading', { name: 'Mes cartes' })).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Carte France' }))

    await screen.findByTestId('workspace')
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalledTimes(2))
    await act(async () => pendingRequests[1]?.())
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-map-opening', 'false'))
  })

  it('opens the maps panel and starts creation from its dedicated button', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    // App initialization is asynchronous; wait for the navigation rail.
    fireEvent.click(await screen.findByRole('button', { name: 'Mes Cartes' }))
    expect(await screen.findByRole('heading', { name: 'Mes cartes' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Créer une carte' }))
    expect(screen.getByRole('heading', { name: 'Créer une carte' })).toBeVisible()
  })

  it('opens the trash workspace at its dedicated route', async () => {
    render(<MemoryRouter initialEntries={['/maps']}><App /><Path /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Corbeille' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/trash'))
  })

  it('collapses and restores the Places panel from its panel control', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Réduire le panneau Lieux' }))
    expect(await screen.findByRole('button', { name: 'Déployer le panneau Lieux' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Lieux' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Déployer le panneau Lieux' }))
    expect(await screen.findByRole('button', { name: 'Réduire le panneau Lieux' })).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
  })

  it('opens administration as a routed modal over the persistent map', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    expect(await screen.findByRole('dialog', { name: 'Administration' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Général' })).toHaveClass('active')
    expect(screen.getByTestId('workspace')).toBeVisible()
    const mapCallsBeforeSectionChange = vi.mocked(getMaps).mock.calls.length
    fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Clés API' })).toBeVisible()
    expect(getMaps).toHaveBeenCalledTimes(mapCallsBeforeSectionChange)
    fireEvent.click(screen.getByRole('link', { name: 'Quotas' }))
    expect(await screen.findByRole('heading', { name: 'Quotas' })).toBeVisible()
    expect(getMaps).toHaveBeenCalledTimes(mapCallsBeforeSectionChange)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`))
  })

  it('guards browser Back from a dirty Admin draft and restores the exact map path on discard', async () => {
    const router = createMemoryRouter([{
      path: '*',
      element: <><App enableNavigationBlocker /><Path /></>,
    }], { initialEntries: [`/maps/${MAP_ID}`] })
    render(<RouterProvider router={router} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    const mediaLimit = await screen.findByLabelText(/Taille maximale par image/)
    fireEvent.change(mediaLimit, { target: { value: '9' } })

    act(() => { void router.navigate(-1) })
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Quitter sans enregistrer ?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuer l’édition' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    expect(screen.getByRole('dialog', { name: 'Administration' })).toBeVisible()
    expect(mediaLimit).toHaveValue(9)

    act(() => { void router.navigate(-1) })
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`))
  })

  it('forward after a discarded back reopens a clean administration without ghost drafts', async () => {
    const router = createMemoryRouter([{
      path: '*',
      element: <><App enableNavigationBlocker /><Path /></>,
    }], { initialEntries: [`/maps/${MAP_ID}`] })
    render(<RouterProvider router={router} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    const mediaLimit = await screen.findByLabelText(/Taille maximale par image/)
    fireEvent.change(mediaLimit, { target: { value: '9' } })

    act(() => { void router.navigate(-1) })
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`))

    // Browser Forward: the administration reopens clean — no ghost draft, no
    // leftover confirmation dialog, no duplicated console.
    act(() => { void router.navigate(1) })
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    expect(screen.getAllByRole('dialog', { name: 'Administration' })).toHaveLength(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Taille maximale par image/)).not.toHaveValue('9')
  })

  it('returns exactly to the originating trip route when abandoning a dirty admin back', async () => {
    const router = createMemoryRouter([{
      path: '*',
      element: <><App enableNavigationBlocker /><Path /></>,
    }], { initialEntries: ['/travels/trip-1'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()

    fireEvent.click(await screen.findByRole('button', { name: 'Menu utilisateur de Admin' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Administration' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    const mediaLimit = await screen.findByLabelText(/Taille maximale par image/)
    fireEvent.change(mediaLimit, { target: { value: '7' } })
    expect(mediaLimit).toHaveValue(7)

    act(() => { void router.navigate(-1) })
    expect(await screen.findByRole('alertdialog', {}, { timeout: 5000 })).toHaveTextContent('Quitter sans enregistrer ?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuer l’édition' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/admin/general'))
    expect(screen.getByRole('dialog', { name: 'Administration' })).toBeVisible()
    expect(mediaLimit).toHaveValue(7)

    act(() => { void router.navigate(-1) })
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1'))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1')
  })

  it('opens the trip workspace with Places and Preparation visible together', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /></MemoryRouter>)

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    const mapContextNavigation = await screen.findByRole('navigation', { name: 'Navigation de la carte' })
    const tripsNavigation = within(mapContextNavigation).getByRole('button', { name: 'Sorties' })
    expect(await screen.findByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(tripsNavigation)
    expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument()
    expect(await screen.findByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(tripsNavigation)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores Places without reopening Sorties after leaving the timeline', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /></MemoryRouter>)

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    const placesNavigation = await screen.findByRole('button', { name: 'Lieux' })
    const tripsNavigation = screen.getByRole('button', { name: 'Sorties' })
    const timelineNavigation = screen.getByRole('button', { name: 'Chronologie' })

    fireEvent.click(tripsNavigation)
    expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument()

    fireEvent.click(timelineNavigation)
    expect(timelineNavigation).toHaveAttribute('aria-pressed', 'true')
    expect(placesNavigation).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(timelineNavigation)
    expect(timelineNavigation).toHaveAttribute('aria-pressed', 'false')
    expect(placesNavigation).toHaveAttribute('aria-pressed', 'true')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument()
    expect(await screen.findByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
  })

  it('keeps the active trip when returning from another workspace', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /><Path /></MemoryRouter>)

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Charger une sortie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Médias' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/medias'))
    fireEvent.click(await screen.findByRole('button', { name: 'Voyage' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1'))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()

    fireEvent.click(await screen.findByRole('button', { name: 'Charger une sortie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner l’étape POI' }))

    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
  })

  it('toggles the Sorties panel when its navigation button is tapped on mobile', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query === MOBILE_NAVIGATION_MEDIA_QUERY, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /></MemoryRouter>)

    const mapContextNavigation = await screen.findByRole('navigation', { name: 'Navigation de la carte' })
    const tripsNavigation = within(mapContextNavigation).getByRole('button', { name: 'Sorties' })
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(tripsNavigation)
    expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument()
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(tripsNavigation)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(tripsNavigation).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens linked and free stop cards from the trip timeline without changing its fitted map view', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Charger une sortie' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Vue du voyage' }))
    const fittedFocus = screen.getByTestId('workspace').getAttribute('data-focus')

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner l’étape POI' }))
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', fittedFocus ?? '')

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner l’étape libre' }))
    expect(await screen.findByRole('heading', { name: 'Belvédère libre' })).toBeVisible()
    expect(screen.getByText('Route des Crêtes')).toBeVisible()
    expect(screen.queryByText('Masquée')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', fittedFocus ?? '')
  })

  it('toggles Places independently while Sorties remains open', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /></MemoryRouter>)

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))

    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lieux' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
  })

  it('toggles the Places panel without navigating away from the map', async () => {
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}`]}><App /><Path /></MemoryRouter>)

    // On the map workspace the Places panel is toggled from its own panel control.
    fireEvent.click(await screen.findByRole('button', { name: 'Réduire le panneau Lieux' }))
    expect(await screen.findByRole('button', { name: 'Déployer le panneau Lieux' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Lieux' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`)

    fireEvent.click(screen.getByRole('button', { name: 'Déployer le panneau Lieux' }))
    expect(await screen.findByRole('searchbox', { name: 'Rechercher dans mes lieux...' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`)
  })

  it('keeps the trip workspace open when unsaved settings cancel main navigation', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /><Path /></MemoryRouter>)

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Simuler des modifications' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))

    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1')
    expect(screen.getByRole('button', { name: 'Sorties' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mes Cartes' })).not.toHaveClass('active')
  })

  it('reports an API failure when moving a map to trash', async () => {
    vi.mocked(deleteMap).mockRejectedValue(new ApiError(409, 'Conflict'))
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Mes Cartes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Options de Carte France' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Supprimer Carte France' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict')
  })

  it('opens a marker in the inline place card and closes back to the active map URL', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    // Wait for the map context to be ready before interacting with markers.
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))
    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    // Desktop place details open inline inside the Places panel.
    const detail = await screen.findByRole('region', { name: 'Détails inline place-id' })
    expect(detail).toHaveTextContent('Popup place-id')
    expect(detail).toHaveAttribute('data-management-actions', 'true')
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}/places/place-id`)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`)
  })

  it('preserves the place search while opening and closing a POI card', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}&q=musée`]}><App /><Path /></MemoryRouter>)

    // Wait for the map context to be ready before interacting with markers.
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))
    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}/places/place-id?q=mus%C3%A9e`)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}?q=mus%C3%A9e`)
  })

  it('centers a POI only when its popup opens and preserves manual map navigation', async () => {
    vi.mocked(getMapPlaces).mockResolvedValue({ items: [], total: 0, returned: 0, truncated: false })
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1'))

    fireEvent.click(screen.getByRole('button', { name: 'Marqueur POI' }))
    await waitFor(() => expect(getPlaceDetails).toHaveBeenCalledWith('place-id', expect.any(AbortSignal)))
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
    const popupFocus = screen.getByTestId('workspace').getAttribute('data-focus')

    fireEvent.click(screen.getByRole('button', { name: 'Bounds A' }))
    await waitFor(() => expect(getMapPlaces).toHaveBeenCalled())

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', popupFocus ?? '')
  })

  it('restores a direct place URL inside the map workspace', async () => {
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}/places/place-id`]}><App /><Path /></MemoryRouter>)
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
    expect(screen.getByTestId('workspace')).toBeVisible()
  })

  it('rejects a direct POI URL whose place belongs to another map', async () => {
    let resolveDetails!: (place: never) => void
    vi.mocked(getPlaceDetails).mockImplementation(() => new Promise((resolve) => { resolveDetails = resolve }))
    const foreignPlace = {
      id: 'place-id',
      name: 'POI hors contexte',
      map_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      latitude: 48,
      longitude: 2,
      status: { id: 'status-id', color: '#2563EB' },
      categories: [],
      tags: [],
      is_favorite: false,
    } as never

    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}/places/place-id?q=musée`]}><App /><Path /></MemoryRouter>)

    await waitFor(() => expect(getPlaceDetails).toHaveBeenCalledWith('place-id', expect.any(AbortSignal)))
    await act(async () => resolveDetails(foreignPlace))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}?q=mus%C3%A9e`))
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-selected', '')
    expect(screen.getByTestId('workspace')).not.toHaveAttribute('data-markers', expect.stringContaining('POI hors contexte'))
  })

  it('keeps map identity and history coherent when switching maps with a selected POI', async () => {
    vi.mocked(getMaps).mockResolvedValue([MAP, MAP_B])
    render(
      <MemoryRouter initialEntries={[`/maps/${MAP_ID}/places/place-id?q=mus%C3%A9e`]}>
        <App />
        <Path />
        <BrowserBack />
        <BrowserForward />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()

    fireEvent.click(await screen.findByRole('button', { name: 'Choisir une carte' }))
    fireEvent.click(screen.getByRole('option', { name: /Carte Italie/ }))

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID_B}?q=mus%C3%A9e`))
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Détails inline place-id' })).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-selected', '')

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}/places/place-id?q=mus%C3%A9e`))
    expect(await screen.findByRole('button', { name: 'Carte France' })).toBeVisible()
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID_B}?q=mus%C3%A9e`))
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Détails inline place-id' })).not.toBeInTheDocument()
  })

  it('keeps the trip map available and reopens the trip after global navigation', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /><Path /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: 'Carte France' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Voyage' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Médias' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/medias'))
    fireEvent.click(screen.getByRole('button', { name: 'Voyage' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1'))
  })

  it('expands a place selected from the active trip Places panel', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-1']}><App /><Path /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('region', { name: 'Détails inline place-id' })).toBeVisible()
    expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-1')
  })

  it('protects a dirty POI before changing the global workspace', async () => {
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    await screen.findByTestId('workspace')
    act(() => {
      document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { formDirty: true } }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Quitter sans enregistrer ?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuer l’édition' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`)

    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/maps'))
  })

  it('installs beforeunload only while a POI is dirty', async () => {
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}`]}><App /></MemoryRouter>)
    await screen.findByTestId('workspace')

    act(() => {
      document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { formDirty: true } }))
    })
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    expect(window.dispatchEvent(dirtyUnload)).toBe(false)
    expect(dirtyUnload.defaultPrevented).toBe(true)

    act(() => {
      document.dispatchEvent(new CustomEvent('cartavault:poi-editor-unsaved', { detail: { formDirty: false } }))
    })
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    expect(window.dispatchEvent(cleanUnload)).toBe(true)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })

  it('removes a revoked active map when access is refreshed', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    await waitFor(() => expect(getMaps).toHaveBeenCalled())
    const callsBeforeRevocation = vi.mocked(getMaps).mock.calls.length
    vi.mocked(getMaps).mockResolvedValue([])

    fireEvent.focus(window)

    await waitFor(() => expect(getMaps).toHaveBeenCalledTimes(callsBeforeRevocation + 1))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/maps'))
  })

  it('refreshes map access silently without hiding the current catalog', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /></MemoryRouter>)
    await waitFor(() => expect(getMaps).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Mes Cartes' }))
    expect(await screen.findByRole('button', { name: 'Ouvrir Carte France' })).toBeVisible()

    let resolveRefresh!: (maps: typeof MAP[]) => void
    vi.mocked(getMaps).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve }))
    fireEvent.focus(window)

    expect(screen.getByRole('button', { name: 'Ouvrir Carte France' })).toBeVisible()
    // A silent refresh must not flash any loading state in the catalog.
    expect(screen.queryByText('Chargement du panneau…')).not.toBeInTheDocument()
    resolveRefresh([MAP])
  })

  it('does not restore an aborted direct URL selection after closing the popup', async () => {
    let resolveDetails!: (place: never) => void
    vi.mocked(getPlaceDetails).mockImplementationOnce(() => new Promise((resolve) => { resolveDetails = resolve }))
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID}/places/place-id`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID}`)
    resolveDetails({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] } as never)
    await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-selected', ''))
  })
})
