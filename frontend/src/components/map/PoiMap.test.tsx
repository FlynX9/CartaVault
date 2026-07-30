import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MapPlace } from '../../types/place'
import type { Trip } from '../../types/trip'
import { PoiMap } from './PoiMap'

const place: MapPlace = {
  id: 'place-id',
  map_id: 'map-id',
  name: 'Manufacture',
  latitude: 48,
  longitude: 2,
  status: { id: 'status-id', color: '#2563EB' },
  primary_category_icon: null,
  category_ids: ['category-id'],
  tag_ids: ['tag-id'],
  is_favorite: false,
}
const nearbyPlace: MapPlace = {
  ...place,
  id: 'nearby-place-id',
  name: 'Atelier voisin',
  latitude: 48.00001,
  longitude: 2.00001,
}

afterEach(cleanup)

function MapHarness({ initiallySelected = false, markerFilter }: { initiallySelected?: boolean; markerFilter?: { query: string; categoryId: string; statusId: string | null; tagId: string } }) {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    initiallySelected ? place.id : null,
  )

  return (
    <>
      <PoiMap
        places={[place]}
        selectedPlaceId={selectedPlaceId}
        initialView={{ center: [48, 2], zoom: 13 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={(selectedPlace) => setSelectedPlaceId(selectedPlace.id)}
        focusRequest={null}
        layoutKey="test"
        onPopupClose={() => setSelectedPlaceId(null)}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
        markerFilter={markerFilter}
      />
      {selectedPlaceId && (
        <article>
          Détails enrichis
          <button type="button" onClick={() => setSelectedPlaceId(null)}>Fermer</button>
        </article>
      )}
    </>
  )
}

describe('PoiMap selection lifecycle', () => {
  it('preserves the Leaflet map instance across panel layout changes', () => {
    const props = {
      places: [place],
      selectedPlaceId: null,
      initialView: { center: [48, 2] as [number, number], zoom: 13 },
      onBoundsChange: vi.fn(),
      onViewChange: vi.fn(),
      onPlaceSelect: vi.fn(),
      focusRequest: null,
      onPopupClose: vi.fn(),
      basemapId: 'cartavault-light' as const,
      onBasemapTileError: vi.fn(),
    }
    const { container, rerender } = render(<PoiMap {...props} layoutKey="closed-closed" />)
    const mapContainer = container.querySelector('.leaflet-container')

    rerender(<PoiMap {...props} layoutKey="open-open" />)

    expect(container.querySelector('.leaflet-container')).toBe(mapContainer)
  })

  it('keeps the selected POI outside its cluster and marks it as selected', async () => {
    const { container } = render(
      <PoiMap
        places={[place, nearbyPlace]}
        selectedPlaceId={place.id}
        initialView={{ center: [48, 2], zoom: 13 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        focusRequest={null}
        layoutKey="selected-cluster"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
      />,
    )

    expect(await screen.findByTitle('Manufacture')).toBeVisible()
    expect(await screen.findByTitle('Atelier voisin')).toBeVisible()
    expect(screen.queryByTitle(/Cluster de/)).not.toBeInTheDocument()
    expect(container.querySelector('.status-marker.selected')).toBeInTheDocument()
  })

  it('renders every POI independently at the configured maximum zoom', async () => {
    render(
      <PoiMap
        places={[place, nearbyPlace]}
        selectedPlaceId={null}
        initialView={{ center: [48, 2], zoom: 19 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        focusRequest={null}
        layoutKey="maximum-zoom"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
      />,
    )

    expect(await screen.findByTitle('Manufacture')).toBeVisible()
    expect(await screen.findByTitle('Atelier voisin')).toBeVisible()
    expect(screen.queryByTitle(/Cluster de/)).not.toBeInTheDocument()
  })

  it('keeps clustering enabled for very large marker sets at maximum zoom', async () => {
    const places = Array.from({ length: 751 }, (_, index) => ({
      ...place,
      id: `place-${index}`,
      name: `Lieu ${index}`,
      latitude: 48 + index * 0.0000001,
      longitude: 2 + index * 0.0000001,
    }))
    const { container } = render(
      <PoiMap
        places={places}
        selectedPlaceId={null}
        initialView={{ center: [48, 2], zoom: 19 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        focusRequest={null}
        layoutKey="large-maximum-zoom"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
      />,
    )

    await waitFor(() => expect(container.querySelectorAll('.cv-map-cluster-container').length).toBeGreaterThan(0))
    expect(container.querySelectorAll('.cv-map-cluster-container').length).toBeLessThan(751)
    expect(screen.queryByTitle('Lieu 0')).not.toBeInTheDocument()
  })

  it('selects the marker and exposes its enriched detail on the first real marker click', async () => {
    render(<MapHarness />)

    const marker = await screen.findByTitle('Manufacture')
    fireEvent.click(marker)

    expect(await screen.findByText('Détails enrichis')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByText('Détails enrichis')).not.toBeInTheDocument())

    fireEvent.click(marker)
    expect(await screen.findByText('Détails enrichis')).toBeVisible()
  })

  it('shows the detail once a preselected marker is mounted', async () => {
    render(<MapHarness initiallySelected />)

    await waitFor(() => expect(screen.getByText('Détails enrichis')).toBeVisible())
  })

  it('closes the detail and clears the selection when the map is clicked', async () => {
    const { container } = render(<MapHarness />)
    fireEvent.click(await screen.findByTitle('Manufacture'))
    expect(await screen.findByText('Détails enrichis')).toBeVisible()

    fireEvent.click(container.querySelector('.leaflet-container') as HTMLElement)

    await waitFor(() => expect(screen.queryByText('Détails enrichis')).not.toBeInTheDocument())
  })

  it('keeps non-matching markers on the map with a muted visual state', async () => {
    const { container } = render(<MapHarness markerFilter={{ query: 'Absent', categoryId: '', statusId: null, tagId: '' }} />)

    await waitFor(() => expect(container.querySelector('.status-marker.muted')).toBeInTheDocument())
  })

  it('filters lightweight category and tag identifiers without full associations', async () => {
    const { container } = render(<MapHarness markerFilter={{ query: '', categoryId: 'category-id', statusId: 'status-id', tagId: 'tag-id' }} />)

    await waitFor(() => expect(container.querySelector('.status-marker')).toBeInTheDocument())
    expect(container.querySelector('.status-marker.muted')).not.toBeInTheDocument()
  })

  it('makes map markers keyboard-focusable and reuses the shared multi-selection', async () => {
    const toggleSelection = vi.fn()
    render(<PoiMap places={[place]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 13 }} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} focusRequest={null} layoutKey="selection" onPopupClose={vi.fn()} basemapId="cartavault-light" onBasemapTileError={vi.fn()} selectionMode selectedPlaceIds={new Set()} onPlaceSelectionToggle={toggleSelection} />)

    const marker = await screen.findByTitle('Manufacture — non sélectionné')
    expect(marker).toHaveAttribute('tabindex', '0')
    expect(marker).toHaveAttribute('aria-label', 'Manufacture, non sélectionné')
    expect(marker).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(marker, { key: ' ' })
    expect(toggleSelection).toHaveBeenCalledWith(place.id)
  })

  it('hides both the route and the stops of a disabled trip day in trip view', async () => {
    const day = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#2563EB', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.1, 48.1]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Étape', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [day] } satisfies Trip
    const commonProps = { places: [], selectedPlaceId: null, initialView: { center: [48, 2] as [number, number], zoom: 13 }, onBoundsChange: vi.fn(), onViewChange: vi.fn(), onPlaceSelect: vi.fn(), focusRequest: null, layoutKey: 'test', onPopupClose: vi.fn(), basemapId: 'cartavault-light' as const, onBasemapTileError: vi.fn(), trip, tripViewOnly: true }
    const { container, rerender } = render(<PoiMap {...commonProps} hiddenTripDayIds={new Set()} />)

    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2))
    expect(container.querySelector('.trip-stop-number')).toBeInTheDocument()

    rerender(<PoiMap {...commonProps} hiddenTripDayIds={new Set(['day-1'])} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0))
    expect(container.querySelector('.trip-stop-number')).not.toBeInTheDocument()
  })
})
