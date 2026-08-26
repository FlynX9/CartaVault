import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useNavigate } from 'react-router-dom'

import { getMaps } from './api/maps'
import { getTrip } from './api/trips'
import type { Trip } from './types/trip'
import App from './App'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn(), getMapProfiles: vi.fn(() => Promise.resolve([])), getPendingMapInvitations: vi.fn(() => Promise.resolve([])), acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn() }))
vi.mock('./api/setup', () => ({ getSetupStatus: vi.fn(() => Promise.resolve({ required: false, locked: true, checks: [] })) }))
vi.mock('./api/users', () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, is_active: true }, loading: false, logout: vi.fn(), refresh: vi.fn(), login: vi.fn() }) }))
vi.mock('./auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve({ items: [], total: 0, returned: 0, truncated: false })), getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(), getPlaceFacets: vi.fn(), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn(), getPlaceDetails: vi.fn() }))
vi.mock('./api/trips', () => ({ getTrip: vi.fn(), listAccessibleTrips: vi.fn(() => Promise.resolve([])), listTrips: vi.fn(() => Promise.resolve([])), restoreTripState: vi.fn() }))
vi.mock('./components/place-list/MapPlaceList', () => ({
  PlacesPanel: ({ onBulkTripChanged }: { onBulkTripChanged: (tripId: string) => void }) => <button type="button" onClick={() => onBulkTripChanged('trip-a')}>Rafraîchir T1</button>,
  TripPlacesPanel: () => <div>Lieux de la sortie</div>,
}))
vi.mock('./components/map-popup/PlaceMapPopup', () => ({ PlaceMapPopup: () => null }))
vi.mock('./components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('./components/trips/TripPlannerPanel', () => ({ TripPlannerPanel: ({ trip }: { trip: Trip }) => <aside aria-label={`Préparation ${trip.name}`} /> }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ placeList, sidebar }: { placeList: ReactNode; sidebar: ReactNode }) => <div data-testid="workspace">{placeList}{sidebar}</div> }))
vi.mock('./components/dashboard/DashboardPage', () => ({ DashboardPage: () => <div>Dashboard</div> }))

const MAP_A = { id: 'map-a', name: 'Carte A', country_id: 'country-a', country: { id: 'country-a', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46, effective_center_longitude: 2, effective_default_zoom: 6, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '', updated_at: '', place_count: 0, trip_count: 0 }
const makeTrip = (id: string, name: string): Trip => ({ id, map_id: MAP_A.id, created_by_user_id: 'user-id', name, description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [] })
const TRIP_A = makeTrip('trip-a', 'Sortie A')
const TRIP_B = makeTrip('trip-b', 'Sortie B')

function Navigation() {
  const navigate = useNavigate()
  return <><button type="button" onClick={() => navigate('/maps/map-a')}>Naviguer carte A</button><button type="button" onClick={() => navigate('/travels/trip-b')}>Naviguer sortie B</button></>
}

beforeEach(() => vi.mocked(getMaps).mockResolvedValue([MAP_A]))
afterEach(() => { cleanup(); vi.clearAllMocks(); window.localStorage.clear() })

describe('trip refresh route identity', () => {
  it('ignores a map-panel refresh response after a newer trip route wins', async () => {
    let resolveStale!: (trip: Trip) => void
    let tripACalls = 0
    vi.mocked(getTrip).mockImplementation(((id: string) => {
      if (id === TRIP_B.id) return Promise.resolve(TRIP_B)
      tripACalls += 1
      return tripACalls === 1 ? Promise.resolve(TRIP_A) : new Promise((resolve) => { resolveStale = resolve })
    }) as never)

    render(<MemoryRouter initialEntries={['/travels/trip-a']}><App /><Navigation /></MemoryRouter>)
    expect(await screen.findByRole('complementary', { name: 'Préparation Sortie A' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Naviguer carte A' }))
    await screen.findByTestId('workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Rafraîchir T1' }))
    await waitFor(() => expect(getTrip).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Naviguer sortie B' }))
    expect(await screen.findByRole('complementary', { name: 'Préparation Sortie B' })).toBeVisible()
    await act(async () => resolveStale(TRIP_A))

    expect(screen.getByRole('complementary', { name: 'Préparation Sortie B' })).toBeVisible()
    expect(screen.queryByRole('complementary', { name: 'Préparation Sortie A' })).not.toBeInTheDocument()
  })
})
