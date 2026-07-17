import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapPage } from './MapPage'

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ onMapContextMenuOpen }: { onMapContextMenuOpen: (state: { latitude: number; longitude: number; containerX: number; containerY: number }) => void }) => (
    <button type="button" onClick={() => onMapContextMenuOpen({ latitude: 48.1234567, longitude: -2.7654321, containerX: 120, containerY: 240 })}>
      Ouvrir le menu contextuel
    </button>
  ),
}))

afterEach(cleanup)

describe('MapPage context menu', () => {
  it('closes the menu and forwards the clicked coordinates to POI creation', () => {
    const onCreateFromCoordinates = vi.fn()

    render(
      <MapPage
        places={[]}
        selectedPlaceId={null}
        initialView={{ center: [48.17, 6.45], zoom: 13 }}
        isLoading={false}
        errorMessage={null}
        sidebarOpen={false}
        placeListOpen={false}
        statuses={[]}
        sidebar={null}
        placeList={null}
        focusRequest={null}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        onCreateFromCoordinates={onCreateFromCoordinates}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu contextuel' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Créer un POI ici' }))

    expect(onCreateFromCoordinates).toHaveBeenCalledWith(48.1234567, -2.7654321)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('offers the active trip days and forwards the clicked coordinates', () => {
    const add = vi.fn()
    render(<MapPage places={[]} selectedPlaceId={null} initialView={{ center: [48.17, 6.45], zoom: 13 }} isLoading={false} errorMessage={null} sidebarOpen placeListOpen statuses={[]} sidebar={null} placeList={null} focusRequest={null} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} trip={{ days: [{ id: 'day-1', day_number: 1, title: 'Bruxelles' }, { id: 'day-2', day_number: 2, title: null }] } as never} onTripCoordinateAdd={add} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu contextuel' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajouter au jour…' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Jour 2' }))
    expect(add).toHaveBeenCalledWith('day-2', 48.1234567, -2.7654321)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
