import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { ApiError } from './api/client'
import { deleteMap, getMaps } from './api/maps'
import { getPlaceDetails } from './api/places'
import App from './App'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn(), getPendingMapInvitations: vi.fn(() => Promise.resolve([])), acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn() }))
vi.mock('./api/users', () => ({ getUsers: vi.fn(() => Promise.resolve([])), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id', email: 'admin@example.test', display_name: 'Admin', is_admin: true, is_active: true }, loading: false, logout: vi.fn(), refresh: vi.fn(), login: vi.fn() }) }))
vi.mock('./auth/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve([])), getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: false, index: null, page: null, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn(), getPlaceDetails: vi.fn(() => Promise.resolve({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] })) }))
vi.mock('./components/map-popup/PlaceMapPopup', () => ({ PlaceMapPopup: ({ placeId, onClose }: { placeId: string; onClose: () => void }) => <div role="dialog">Popup {placeId}<button onClick={onClose}>Fermer popup</button></div> }))
vi.mock('./components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('./components/trips/TripPlannerPanel', () => ({ TripPlannerPanel: ({ tripViewOnly = false, onTripViewOnlyChange }: { tripViewOnly?: boolean; onTripViewOnlyChange: (enabled: boolean) => void }) => <aside aria-label="Préparation de sortie" data-trip-view={String(tripViewOnly)}><button type="button" onClick={() => onTripViewOnlyChange(true)}>Vue du voyage</button></aside> }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ placeList, sidebar, popupContent, focusRequest, selectedPlaceId, onPlaceSelect }: { placeList: ReactNode; sidebar: ReactNode; popupContent: ReactNode; focusRequest: { id: number } | null; selectedPlaceId: string | null; onPlaceSelect: (place: never) => void }) => <div data-testid="workspace" data-focus={focusRequest?.id ?? ''} data-selected={selectedPlaceId ?? ''}><button onClick={() => onPlaceSelect({ id: 'place-id', name: 'POI', map_id: MAP_ID, latitude: 48, longitude: 2, categories: [], tags: [] } as never)}>Marqueur POI</button>{placeList}{popupContent}{sidebar}</div> }))

const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MAP = { id: MAP_ID, name: 'Carte France', country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', country: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46.2, effective_center_longitude: 2.2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }

function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}{location.search}</output> }

beforeEach(() => vi.mocked(getMaps).mockResolvedValue([MAP]))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('map URL workspace', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Vue du voyage' }))
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'true')
    expect(screen.queryByRole('searchbox', { name: 'Rechercher un lieu' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sorties' }))
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveAttribute('data-trip-view', 'false')
    expect(await screen.findByRole('searchbox', { name: 'Rechercher un lieu, une adresse…' })).toBeVisible()
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

  it('reports refusal when deleting a map from the maps panel', async () => {
    vi.mocked(deleteMap).mockRejectedValue(new ApiError(409, 'Conflict'))
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Cartes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Carte France' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette carte contient des POI')
  })

  it('opens a marker in the map popup and closes back to the active map URL', async () => {
    render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Marqueur POI' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Popup place-id')
    expect(screen.getByTestId('path')).toHaveTextContent(`/places/place-id?map=${MAP_ID}`)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer popup' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`)
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
