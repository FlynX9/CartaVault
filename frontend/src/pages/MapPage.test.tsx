import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MapPage } from './MapPage'

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ layoutKey }: { layoutKey: string }) => (
    <div data-testid="poi-map" data-layout-key={layoutKey} />
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
  })
})
