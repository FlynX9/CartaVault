/** AUD-008: single canonical trip loader, no stale A/B response races. */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import { getMaps } from './api/maps'
import { getTrip, listAccessibleTrips } from './api/trips'
import type { Trip } from './types/trip'
import App from './App'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn(), getMapProfiles: vi.fn(() => Promise.resolve([])), getPendingMapInvitations: vi.fn(() => Promise.resolve([])), acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn() }))
vi.mock('./api/setup', () => ({ getSetupStatus: vi.fn(() => Promise.resolve({ required: false, locked: true, checks: [] })) }))
vi.mock('./api/users', () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, is_active: true }, loading: false, logout: vi.fn(), refresh: vi.fn(), login: vi.fn() }) }))
vi.mock('./auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve({ items: [], total: 0, returned: 0, truncated: false })), getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: false, index: null, page: null, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn(), getPlaceDetails: vi.fn(() => Promise.resolve({ id: 'place-id', name: 'POI', map_id: MAP_ID_A, latitude: 48, longitude: 2, status: { id: 'status-id', color: '#2563EB' }, categories: [], tags: [], is_favorite: false })) })) 
vi.mock('./api/trips', () => ({
  getTrip: vi.fn(),
  listAccessibleTrips: vi.fn(() => Promise.resolve([])),
  listTrips: vi.fn(() => Promise.resolve([])),
  restoreTripState: vi.fn(),
}))
vi.mock('./components/map-popup/PlaceMapPopup', () => ({ PlaceMapPopup: ({ placeId, onClose }: { placeId: string; onClose: () => void }) => <div role="dialog">Popup {placeId}<button onClick={onClose}>Fermer popup</button></div> }))
vi.mock('./components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('./components/trips/TripPlannerPanel', () => ({ TripPlannerPanel: () => <aside aria-label="Préparation de sortie" /> }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ places, placeList, sidebar, popupContent, tripNotice }: { places: Array<{ id: string; name: string }>; placeList: unknown; sidebar: unknown; popupContent: unknown; tripNotice: string | null }) => <div data-testid="workspace" data-markers={places.map((place) => place.name).join(',')}>{tripNotice ? <p role="alert">{tripNotice}</p> : null}{placeList as never}{popupContent as never}{sidebar as never}</div> }))
vi.mock('./components/dashboard/DashboardPage', () => ({ DashboardPage: ({ onOpenTrip }: { onOpenTrip: (tripId: string) => void }) => <div>Dashboard<button type="button" onClick={() => onOpenTrip('trip-a')}>Dashboard ouvrir A</button></div> }))

const MAP_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MAP_ID_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MAP_A = { id: MAP_ID_A, name: 'Carte France', country_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', country: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46.2, effective_center_longitude: 2.2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00', place_count: 0, trip_count: 0 }
const MAP_B = { ...MAP_A, id: MAP_ID_B, name: 'Carte Italie' }
const MAPS = [MAP_A, MAP_B]

const makeTrip = (id: string, name: string, mapId: string): Trip => ({ id, map_id: mapId, created_by_user_id: 'user-id', name, description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [{ id: `${id}-day`, trip_id: id, day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed', safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: null, route_duration_seconds: null, visit_duration_minutes: 0, total_duration_minutes: 0, route_geometry: null, route_segments: null, route_status: null, sort_order: 0, stops: [] }]
})
const TRIP_A = makeTrip('trip-a', 'Sortie A', MAP_ID_A)
const TRIP_B = makeTrip('trip-b', 'Sortie B', MAP_ID_B)
const CATALOG_ITEM = (trip: Trip) => ({ id: trip.id, name: trip.name, map_id: trip.map_id, map_name: trip.map_id === MAP_ID_B ? 'Carte Italie' : 'Carte France', country_name: 'Pays', country_code: 'FR', start_date: null, end_date: null, status: 'draft' as const, created_at: '', updated_at: '', day_count: 1, stop_count: 0, thumbnail_photo_id: null })

type Deferred = { promise: Promise<never>; resolve: (value: never) => void; reject: (error: Error) => void }
const deferreds = new Map<string, Deferred[]>()
const tripCalls: Array<{ id: string; signal: AbortSignal | undefined }> = []

function deferCall(id: string, signal?: AbortSignal) {
  let resolve!: (value: never) => void
  let reject!: (error: Error) => void
  const promise = new Promise<never>((res, rej) => { resolve = res; reject = rej })
  tripCalls.push({ id, signal })
  const queue = deferreds.get(id) ?? []
  queue.push({ promise, resolve, reject })
  deferreds.set(id, queue)
  return promise
}

const pendingCallsFor = (id: string) => tripCalls.filter((call) => call.id === id)

function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}</output> }
function HistoryControls() {
  const navigate = useNavigate()
  return <><button type="button" onClick={() => navigate('/travels/trip-b')}>Ouvrir Sortie B</button><button type="button" onClick={() => navigate(-1)}>Précédent</button><button type="button" onClick={() => navigate(1)}>Suivant</button></>
}

async function flushAsyncWork() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  deferreds.clear()
  tripCalls.length = 0
  vi.mocked(getMaps).mockResolvedValue(MAPS)
  vi.mocked(getTrip).mockImplementation(((id: string, signal?: AbortSignal) => deferCall(id, signal)) as never)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('AUD-008 canonical trip loading', () => {
  it('catalogue opening loads once through the route effect and ignores a late stale response', async () => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([CATALOG_ITEM(TRIP_A), CATALOG_ITEM(TRIP_B)])
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    // Wait for the initial / -> /dashboard normalization before interacting.
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'))
    fireEvent.click(await screen.findByRole('button', { name: 'Mes Sorties' }))
    await screen.findByRole('heading', { name: 'Mes Sorties' }, { timeout: 10000 })

    // Open A (slow) via its catalog card action button.
    const cardA = (await screen.findByText('Sortie A', {}, { timeout: 10000 })).closest('li') as HTMLElement
    fireEvent.click(within(cardA).getByRole('button'))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-a'))
    expect(pendingCallsFor('trip-a')).toHaveLength(1)

    // Back to the catalog, then open B.
    fireEvent.click(screen.getByRole('button', { name: 'Mes Sorties' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels'))
    const cardB = (await screen.findByText('Sortie B', {}, { timeout: 10000 })).closest('li') as HTMLElement
    fireEvent.click(within(cardB).getByRole('button'))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(pendingCallsFor('trip-b')).toHaveLength(1)

    await act(async () => { deferreds.get('trip-b')![0].resolve(TRIP_B as never) })
    expect(await screen.findByRole('button', { name: 'Sortie B' }, { timeout: 5000 })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()

    // The slow A answer arrives late under route B: it must be ignored.
    await act(async () => { deferreds.get('trip-a')![0].resolve(TRIP_A as never) })
    await flushAsyncWork()
    expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b')
    expect(screen.queryByRole('button', { name: 'Sortie A' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sortie B' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  }, 30000)

  it('selector switching performs a single load per trip', async () => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([CATALOG_ITEM(TRIP_A), CATALOG_ITEM(TRIP_B)])
    render(<MemoryRouter initialEntries={['/travels/trip-a']}><App /><Path /></MemoryRouter>)
    await waitFor(() => expect(pendingCallsFor('trip-a')).toHaveLength(1))
    await act(async () => { deferreds.get('trip-a')![0].resolve(TRIP_A as never) })
    expect(await screen.findByRole('button', { name: 'Sortie A' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Choisir un voyage' }))
    fireEvent.click(await screen.findByRole('option', { name: /Sortie B/ }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(pendingCallsFor('trip-b')).toHaveLength(1)
    await act(async () => { deferreds.get('trip-b')![0].resolve(TRIP_B as never) })
    await flushAsyncWork()

    expect(await screen.findByRole('button', { name: 'Sortie B' }, { timeout: 5000 })).toBeVisible()
  })

  it('keeps the route, trip cache and map context aligned through trip Back and Forward', async () => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([CATALOG_ITEM(TRIP_A), CATALOG_ITEM(TRIP_B)])
    vi.mocked(getTrip).mockImplementation(((id: string) => Promise.resolve(id === TRIP_A.id ? TRIP_A : TRIP_B)) as never)
    render(<MemoryRouter initialEntries={['/travels/trip-a']}><App /><Path /><HistoryControls /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Sortie A' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte France' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Choisir un voyage' }))
    fireEvent.click(await screen.findByRole('option', { name: /Sortie B/ }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(await screen.findByRole('button', { name: 'Sortie B' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-a'))
    expect(await screen.findByRole('button', { name: 'Sortie A' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte France' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(await screen.findByRole('button', { name: 'Sortie B' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()

    expect(vi.mocked(getTrip).mock.calls.filter(([id]) => id === TRIP_A.id)).toHaveLength(2)
    expect(vi.mocked(getTrip).mock.calls.filter(([id]) => id === TRIP_B.id)).toHaveLength(2)
  })

  it('keeps Map and Trip workspaces distinct through Back and Forward', async () => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([CATALOG_ITEM(TRIP_B)])
    vi.mocked(getTrip).mockResolvedValue(TRIP_B)
    render(<MemoryRouter initialEntries={[`/maps/${MAP_ID_A}`]}><App /><Path /><HistoryControls /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Carte France' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir Sortie B' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(await screen.findByRole('button', { name: 'Sortie B' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/maps/${MAP_ID_A}`))
    expect(await screen.findByRole('button', { name: 'Carte France' })).toBeVisible()
    // The last trip remains a deliberate navigation shortcut, but it is not
    // the active workspace and cannot inject trip-only panels into the map.
    expect(screen.getByRole('button', { name: 'Sortie B' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('complementary', { name: 'Préparation de sortie' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Organisation' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-b'))
    expect(await screen.findByRole('button', { name: 'Sortie B' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Carte Italie' })).toBeVisible()
  })

  it('does not present a cached trip as active in the trip catalog', async () => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([CATALOG_ITEM(TRIP_A)])
    vi.mocked(getTrip).mockResolvedValue(TRIP_A)
    render(<MemoryRouter initialEntries={['/travels/trip-a']}><App /><Path /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Sortie A' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Mes Sorties' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels'))
    const cardTitle = (await screen.findAllByText('Sortie A')).find((element) => element.tagName === 'STRONG')
    const card = cardTitle?.closest('li') as HTMLElement
    expect(within(card).getByRole('button', { name: 'Ouvrir' })).toBeVisible()
    expect(within(card).queryByRole('button', { name: 'Fermer' })).not.toBeInTheDocument()
  })

  it('dashboard opening performs a single load per trip', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Dashboard ouvrir A' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-a'))
    await flushAsyncWork()
    expect(pendingCallsFor('trip-a')).toHaveLength(1)
  })

  it('a stale rejection does not surface an error nor redirect the current route', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-a']}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Mes Sorties' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels'))

    await act(async () => { deferreds.get('trip-a')![0].reject(new Error('Introuvable')) })
    await flushAsyncWork()

    expect(screen.getByTestId('path')).toHaveTextContent('/travels')
    expect(screen.queryByRole('alert', { name: /Introuvable/ })).not.toBeInTheDocument()
  })

  it('StrictMode dev double-invoke aborts the first request and applies only the last', async () => {
    render(<MemoryRouter initialEntries={['/travels/trip-a']}><StrictMode><App /></StrictMode></MemoryRouter>)
    await waitFor(() => expect(pendingCallsFor('trip-a').length).toBeGreaterThanOrEqual(2))
    const [first, second] = pendingCallsFor('trip-a')
    expect(first.signal?.aborted).toBe(true)
    expect(second.signal?.aborted).toBe(false)

    await act(async () => { deferreds.get('trip-a')!.at(-1)!.resolve(TRIP_A as never) })
    expect(await screen.findByRole('button', { name: 'Sortie A' })).toBeVisible()
  })

  it('delete during an in-flight load keeps the deleted trip out of state', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Mes Sorties' }))
    const openButtons = await screen.findAllByRole('button', { name: 'Ouvrir' }, { timeout: 5000 })
    fireEvent.click(openButtons[0])
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels/trip-a'))

    // User goes back to the catalog while the load is still in flight.
    fireEvent.click(screen.getByRole('button', { name: 'Mes Sorties' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/travels'))
    await act(async () => { deferreds.get('trip-a')![0].resolve(TRIP_A as never) })
    await flushAsyncWork()

    expect(screen.getByTestId('path')).toHaveTextContent('/travels')
    expect(screen.queryByRole('button', { name: 'Sortie A' })).not.toBeInTheDocument()
  })
})
