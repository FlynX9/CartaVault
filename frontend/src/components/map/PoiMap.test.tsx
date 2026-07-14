import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MapPlace } from '../../types/place'
import { PoiMap } from './PoiMap'

const place: MapPlace = {
  id: 'place-id',
  map_id: 'map-id',
  name: 'Manufacture',
  latitude: 48,
  longitude: 2,
  status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB' },
  categories: [],
  tags: [],
}

afterEach(cleanup)

function MapHarness({ initiallySelected = false }: { initiallySelected?: boolean }) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    initiallySelected ? place.id : null,
  )

  return (
    <PoiMap
      places={[place]}
      selectedPlaceId={selectedPlaceId}
      initialView={{ center: [48, 2], zoom: 13 }}
      onBoundsChange={vi.fn()}
      onViewChange={vi.fn()}
      onPlaceSelect={(selectedPlace) => setSelectedPlaceId(selectedPlace.id)}
      focusRequest={null}
      layoutKey="test"
      popupContent={(
        <article>
          Détails enrichis
          <button type="button" onClick={() => setSelectedPlaceId(null)}>Fermer</button>
        </article>
      )}
      onPopupClose={() => setSelectedPlaceId(null)}
    />
  )
}

describe('PoiMap Leaflet popup lifecycle', () => {
  it('opens the enriched popup on the first real marker click', async () => {
    render(<MapHarness />)

    const marker = await screen.findByTitle('Manufacture')
    fireEvent.click(marker)

    expect(await screen.findByText('Détails enrichis')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByText('Détails enrichis')).not.toBeInTheDocument())

    fireEvent.click(marker)
    expect(await screen.findByText('Détails enrichis')).toBeVisible()
  })

  it('opens the popup once a preselected marker and its popup are mounted', async () => {
    render(<MapHarness initiallySelected />)

    await waitFor(() => expect(screen.getByText('Détails enrichis')).toBeVisible())
  })

  it('closes the popup and clears the selection when the map is clicked', async () => {
    const { container } = render(<MapHarness />)
    fireEvent.click(await screen.findByTitle('Manufacture'))
    expect(await screen.findByText('Détails enrichis')).toBeVisible()

    fireEvent.click(container.querySelector('.leaflet-container') as HTMLElement)

    await waitFor(() => expect(screen.queryByText('Détails enrichis')).not.toBeInTheDocument())
  })
})
