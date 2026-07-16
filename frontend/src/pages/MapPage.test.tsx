import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MapPage } from './MapPage'

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ layoutKey, basemapId, onBasemapTileError }: { layoutKey: string; basemapId: string; onBasemapTileError: () => void }) => (
    <div data-testid="poi-map" data-layout-key={layoutKey} data-basemap-id={basemapId}>
      <button type="button" onClick={onBasemapTileError}>Simuler l'erreur de tuiles</button>
    </div>
  ),
}))

afterEach(cleanup)

describe('MapPage', () => {
  it('keeps the map and sidebar in the same responsive workspace', () => {
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
          statuses={[{ id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }]}
          sidebar={<aside aria-label="Volet de test">Contenu</aside>}
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
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-layout-key', 'true-true')
    expect(screen.getByLabelText('Liste de test')).toBeVisible()
    expect(screen.getByLabelText('Volet de test')).toBeVisible()
    expect(screen.getByLabelText('Légende des statuts')).toHaveTextContent('À faire')
    fireEvent.mouseEnter(screen.getByRole('group', { name: 'Fond cartographique' }))
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le fond Satellite' }))
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'satellite')
    fireEvent.click(screen.getByRole('button', { name: "Simuler l'erreur de tuiles" }))
    expect(screen.getByRole('alert')).toHaveTextContent('Stadia Maps est indisponible')
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser OSM' }))
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-basemap-id', 'osm')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
