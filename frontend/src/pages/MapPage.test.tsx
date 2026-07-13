import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { MapPage } from './MapPage'

vi.mock('../components/map/PoiMap', () => ({
  PoiMap: ({ sidebarOpen }: { sidebarOpen: boolean }) => (
    <div data-testid="poi-map" data-sidebar-open={String(sidebarOpen)} />
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
          sidebar={<aside aria-label="Volet de test">Contenu</aside>}
          onBoundsChange={vi.fn()}
          onViewChange={vi.fn()}
          onPlaceSelect={vi.fn()}
        />
      </MemoryRouter>,
    )

    const workspace = screen.getByLabelText("Carte des points d'intérêt").parentElement
    expect(workspace).toHaveClass('map-workspace', 'sidebar-open')
    expect(screen.getByTestId('poi-map')).toHaveAttribute('data-sidebar-open', 'true')
    expect(screen.getByLabelText('Volet de test')).toBeVisible()
  })
})
