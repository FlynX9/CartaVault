import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import { getAvailableCountries, getPlaces } from './api/places'
import type { MapFocusRequest, MapPlace, PlaceDetails } from './types/place'
import App from './App'

vi.mock('./api/places', () => ({
  getAvailableCountries: vi.fn(),
  getMapPlaces: vi.fn(() => Promise.resolve([])),
  getPlaces: vi.fn(() => Promise.resolve([])),
}))

const PLACE: MapPlace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ancienne manufacture',
  latitude: 48.17,
  longitude: 6.45,
  categories: [],
  tags: [],
}

const PLACE_DETAILS: PlaceDetails = {
  ...PLACE,
  description: null,
  country: 'France',
  region: null,
  construction_date: null,
  abandonment_date: null,
  condition: null,
  access: null,
  danger_level: null,
  categories: [],
  tags: [],
  created_at: '2026-07-13T10:00:00',
  updated_at: '2026-07-13T10:00:00',
}

vi.mock('./pages/MapPage', () => ({
  MapPage: ({
    sidebar,
    onPlaceSelect,
    selectedPlaceId,
    placeList,
    focusRequest,
  }: {
    sidebar: ReactNode
    onPlaceSelect: (place: MapPlace) => void
    selectedPlaceId: string | null
    placeList: ReactNode
    focusRequest: MapFocusRequest | null
  }) => (
    <div
      data-testid="map-workspace"
      data-selected-id={selectedPlaceId ?? ''}
      data-focus-id={focusRequest?.id ?? ''}
    >
      <button type="button" onClick={() => onPlaceSelect(PLACE)}>Marqueur manufacture</button>
      {placeList}
      {sidebar}
    </div>
  ),
}))

vi.mock('./pages/PlaceDetailsPage', () => ({
  PlaceDetailsPage: ({ placeId }: { placeId: string }) => <div>Fiche détaillée {placeId}</div>,
}))

vi.mock('./pages/PlaceEditorPage', () => ({
  PlaceEditorPage: ({ mode }: { mode: string }) => <div>Formulaire {mode}</div>,
}))

function CurrentPath() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}{location.search}</output>
}

function BrowserBack() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Retour navigateur</button>
}

function renderApp(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <App />
      <CurrentPath />
      <BrowserBack />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(getAvailableCountries).mockResolvedValue(['France', 'Belgique'])
  vi.mocked(getPlaces).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('map workspace routing', () => {
  it('renders the map alone on /', () => {
    renderApp('/')
    expect(screen.getByTestId('map-workspace')).toBeVisible()
    expect(screen.queryByLabelText('Volet du point d’intérêt')).not.toBeInTheDocument()
  })

  it.each([
    [`/places/${PLACE.id}`, `Fiche détaillée ${PLACE.id}`],
    [`/places/${PLACE.id}/edit`, 'Formulaire edit'],
    ['/places/new', 'Formulaire create'],
  ])('keeps the map visible for %s', (pathname, content) => {
    renderApp(pathname)
    expect(screen.getByTestId('map-workspace')).toBeVisible()
    expect(screen.getByText(content)).toBeVisible()
  })

  it('opens a preview, then details, without replacing the map', () => {
    renderApp('/')
    const map = screen.getByTestId('map-workspace')
    fireEvent.click(screen.getByRole('button', { name: 'Marqueur manufacture' }))
    expect(map).toHaveAttribute('data-selected-id', PLACE.id)
    expect(screen.getByLabelText('Aperçu de Ancienne manufacture')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Fiche' }))
    expect(screen.getByText(`Fiche détaillée ${PLACE.id}`)).toBeVisible()
    expect(screen.getByTestId('map-workspace')).toBe(map)
    expect(map).toHaveAttribute('data-selected-id', PLACE.id)

    fireEvent.click(screen.getByRole('button', { name: 'Retour navigateur' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/')
    expect(screen.getByLabelText('Aperçu de Ancienne manufacture')).toBeVisible()
    expect(screen.getByTestId('map-workspace')).toBe(map)
  })

  it('closes a routed sidebar back to /', () => {
    renderApp(`/places/${PLACE.id}?country=France`)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le volet' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/?country=France')
    expect(screen.queryByLabelText('Volet du point d’intérêt')).not.toBeInTheDocument()
  })

  it('restores the country from the URL and recenters only once', async () => {
    renderApp('/?country=France')
    expect(await screen.findByRole('combobox', { name: 'Pays' })).toHaveValue('France')
    await waitFor(() => expect(screen.getByTestId('map-workspace')).toHaveAttribute('data-focus-id', '1'))

    fireEvent.click(screen.getByRole('button', { name: 'Masquer la liste' }))
    expect(screen.getByTestId('map-workspace')).toHaveAttribute('data-focus-id', '1')

    fireEvent.change(screen.getByRole('combobox', { name: 'Pays' }), {
      target: { value: 'Belgique' },
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/?country=Belgique')
    await waitFor(() => expect(screen.getByTestId('map-workspace')).toHaveAttribute('data-focus-id', '2'))
  })

  it('synchronizes a country list selection with the marker and preview', async () => {
    vi.mocked(getPlaces).mockResolvedValue([PLACE_DETAILS])
    renderApp('/?country=France')

    fireEvent.click(await screen.findByRole('button', { name: 'Ancienne manufacture' }))
    expect(screen.getByTestId('map-workspace')).toHaveAttribute('data-selected-id', PLACE.id)
    expect(screen.getByLabelText('Aperçu de Ancienne manufacture')).toBeVisible()

    fireEvent.click(screen.getByRole('link', { name: 'Fiche' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent(
      `/places/${PLACE.id}?country=France`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retour navigateur' }))

    fireEvent.click(screen.getByRole('button', { name: 'Marqueur manufacture' }))
    expect(screen.getByRole('button', { name: 'Ancienne manufacture' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })
})
