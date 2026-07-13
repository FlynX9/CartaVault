import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

import type { MapPlace } from './types/place'
import App from './App'

const PLACE: MapPlace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ancienne manufacture',
  latitude: 48.17,
  longitude: 6.45,
  categories: [],
  tags: [],
}

vi.mock('./pages/MapPage', () => ({
  MapPage: ({
    sidebar,
    onPlaceSelect,
    selectedPlaceId,
  }: {
    sidebar: ReactNode
    onPlaceSelect: (place: MapPlace) => void
    selectedPlaceId: string | null
  }) => (
    <div data-testid="map-workspace" data-selected-id={selectedPlaceId ?? ''}>
      <button type="button" onClick={() => onPlaceSelect(PLACE)}>Marqueur manufacture</button>
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
  return <output data-testid="current-path">{useLocation().pathname}</output>
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

afterEach(cleanup)

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
    renderApp(`/places/${PLACE.id}`)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le volet' }))
    expect(screen.getByTestId('current-path')).toHaveTextContent('/')
    expect(screen.queryByLabelText('Volet du point d’intérêt')).not.toBeInTheDocument()
  })
})
