import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MapPage } from './MapPage'

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ onMapContextMenuOpen }: { onMapContextMenuOpen: (state: { latitude: number; longitude: number; containerX: number; containerY: number }) => void }) => (
    <button type="button" onClick={() => onMapContextMenuOpen({ latitude: 48.1234567, longitude: -2.7654321, containerX: 120, containerY: 240 })}>
      Ouvrir le menu contextuel
    </button>
  ),
}))

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
})
