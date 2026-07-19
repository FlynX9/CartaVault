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
  status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB' },
  categories: [],
  tags: [],
}

afterEach(cleanup)

function MapHarness({ initiallySelected = false, markerFilter, onTripPlaceAdd }: { initiallySelected?: boolean; markerFilter?: { query: string; categoryId: string; statusId: string | null; tagId: string }; onTripPlaceAdd?: (place: MapPlace) => void }) {
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
      basemapId="cartavault-light"
      onBasemapTileError={vi.fn()}
      markerFilter={markerFilter}
      onTripPlaceAdd={onTripPlaceAdd}
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

  it('keeps non-matching markers on the map with a muted visual state', async () => {
    const { container } = render(<MapHarness markerFilter={{ query: 'Absent', categoryId: '', statusId: null, tagId: '' }} />)

    await waitFor(() => expect(container.querySelector('.status-marker.muted')).toBeInTheDocument())
  })

  it('adds a marker to the active trip day on double click in trip mode', async () => {
    const add = vi.fn()
    render(<MapHarness onTripPlaceAdd={add} />)
    fireEvent.doubleClick(await screen.findByTitle('Manufacture'))
    expect(add).toHaveBeenCalledWith(place)
  })

  it('hides both the route and the stops of a disabled trip day in trip view', async () => {
    const day = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#2563EB', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.1, 48.1]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Étape', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [day] } satisfies Trip
    const commonProps = { places: [], selectedPlaceId: null, initialView: { center: [48, 2] as [number, number], zoom: 13 }, onBoundsChange: vi.fn(), onViewChange: vi.fn(), onPlaceSelect: vi.fn(), focusRequest: null, layoutKey: 'test', popupContent: null, onPopupClose: vi.fn(), basemapId: 'cartavault-light' as const, onBasemapTileError: vi.fn(), trip, tripViewOnly: true }
    const { container, rerender } = render(<PoiMap {...commonProps} hiddenTripDayIds={new Set()} />)

    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2))
    expect(container.querySelector('.trip-stop-number')).toBeInTheDocument()

    rerender(<PoiMap {...commonProps} hiddenTripDayIds={new Set(['day-1'])} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0))
    expect(container.querySelector('.trip-stop-number')).not.toBeInTheDocument()
  })
})
