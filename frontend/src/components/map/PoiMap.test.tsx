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
  it('keeps marker selection independent while measurement mode is active', async () => {
    const onPlaceSelect = vi.fn()
    const onMeasurementPointAdd = vi.fn()
    render(
      <PoiMap
        places={[place]}
        selectedPlaceId={null}
        initialView={{ center: [48, 2], zoom: 13 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={onPlaceSelect}
        focusRequest={null}
        layoutKey="measurement-marker"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
        measurementActive
        onMeasurementPointAdd={onMeasurementPointAdd}
      />,
    )

    fireEvent.click(await screen.findByTitle('Manufacture'))

    expect(onPlaceSelect).toHaveBeenCalledWith(place)
    expect(onMeasurementPointAdd).not.toHaveBeenCalled()
  })

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

  it('groups nearby POIs only below the clustering zoom threshold', async () => {
    render(
      <PoiMap
        places={[place, nearbyPlace]}
        selectedPlaceId={null}
        initialView={{ center: [48, 2], zoom: 10 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        focusRequest={null}
        layoutKey="low-zoom-cluster"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
      />,
    )

    expect(await screen.findByTitle('Cluster de 2 lieux')).toBeVisible()
    expect(screen.queryByTitle('Manufacture')).not.toBeInTheDocument()
  })

  it('disables clustering as soon as zoom 11 is reached', async () => {
    render(
      <PoiMap
        places={[place, nearbyPlace]}
        selectedPlaceId={null}
        initialView={{ center: [48, 2], zoom: 11 }}
        onBoundsChange={vi.fn()}
        onViewChange={vi.fn()}
        onPlaceSelect={vi.fn()}
        focusRequest={null}
        layoutKey="cluster-threshold"
        onPopupClose={vi.fn()}
        basemapId="cartavault-light"
        onBasemapTileError={vi.fn()}
      />,
    )

    expect(await screen.findByTitle('Manufacture')).toBeVisible()
    expect(await screen.findByTitle('Atelier voisin')).toBeVisible()
    expect(screen.queryByTitle(/Cluster de/)).not.toBeInTheDocument()
  })

  it('keeps large marker sets unclustered at high zoom', async () => {
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

    expect(await screen.findByTitle('Lieu 0')).toBeVisible()
    expect(container.querySelectorAll('.cv-map-cluster-container')).toHaveLength(0)
    expect(container.querySelectorAll('.status-marker')).toHaveLength(751)
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
    const { container, rerender } = render(<PoiMap {...commonProps} selectedTripStopId="stop-1" hiddenTripDayIds={new Set()} />)

    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(2))
    expect(container.querySelector('.trip-stop-number')).toBeInTheDocument()
    expect(container.querySelector('.trip-stop-number--selected')).toBeInTheDocument()
    const selectedStopMarker = [...container.querySelectorAll<SVGPathElement>('.leaflet-overlay-pane path')].find((path) => path.getAttribute('stroke-width') === '5')
    expect(selectedStopMarker).toHaveAttribute('stroke', 'white')

    rerender(<PoiMap {...commonProps} hiddenTripDayIds={new Set(['day-1'])} />)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0))
    expect(container.querySelector('.trip-stop-number')).not.toBeInTheDocument()
  })

  it('replaces a selected POI marker with a numbered marker using the trip day color', async () => {
    const day = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#2563EB', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.1, 48.1]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: place.id, stop_type: 'place' as const, name: place.name, latitude: place.latitude, longitude: place.longitude, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [day] } satisfies Trip
    const { container } = render(<PoiMap places={[place]} selectedPlaceId={place.id} initialView={{ center: [48, 2], zoom: 13 }} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} focusRequest={null} layoutKey="selected-trip-poi" onPopupClose={vi.fn()} basemapId="cartavault-light" onBasemapTileError={vi.fn()} trip={trip} tripViewOnly activeTripDayId="day-1" selectedTripStopId="stop-1" />)

    await waitFor(() => expect(container.querySelector('.trip-selected-stop-marker')).toHaveTextContent('1'))
    expect(container.querySelector('.trip-selected-stop-marker')).toHaveStyle({ '--trip-stop-color': '#2563EB' })
    expect(container.querySelector('.status-marker')).not.toBeInTheDocument()
    expect(container.querySelector('.trip-stop-number--selected')).not.toBeInTheDocument()
  })

  it('emphasizes the route and stop selected directly by the preview timeline', async () => {
    const baseDay = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#2563EB', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.1, 48.1]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Jour 1', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const selectedDay = { ...baseDay, id: 'day-2', day_number: 2, color: '#DC2626', sort_order: 1, route_geometry: { type: 'LineString' as const, coordinates: [[3, 49], [3.1, 49.1]] as [number, number][] }, stops: [{ ...baseDay.stops[0], id: 'stop-2', trip_day_id: 'day-2', name: 'Jour 2', latitude: 49, longitude: 3 }] }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [], days: [baseDay, selectedDay] } satisfies Trip
    const { container } = render(<PoiMap places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 6 }} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} focusRequest={null} layoutKey="selected-route" onPopupClose={vi.fn()} basemapId="cartavault-light" onBasemapTileError={vi.fn()} trip={trip} tripViewOnly activeTripDayId="day-1" selectedTripTimelineKey="stop:stop-2" />)

    await waitFor(() => expect(container.querySelector('.leaflet-overlay-pane path[stroke="#DC2626"][stroke-width="6"]')).toBeInTheDocument())
    expect(container.querySelector('.leaflet-overlay-pane path[stroke="#2563EB"][stroke-width="3"]')).toBeInTheDocument()
    expect(container.querySelector('.trip-stop-number--selected')).toBeInTheDocument()
  })

  it('emphasizes both routes and combines their endpoint icons when a transition night is selected', async () => {
    const firstDay = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.2, 48.2]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Jour 1', latitude: 48.1, longitude: 2.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const secondDay = { ...firstDay, id: 'day-2', day_number: 2, color: '#2563EB', sort_order: 1, route_geometry: { type: 'LineString' as const, coordinates: [[2.2, 48.2], [3, 49]] as [number, number][] }, stops: [{ ...firstDay.stops[0], id: 'stop-2', trip_day_id: 'day-2', name: 'Jour 2', latitude: 49, longitude: 3 }] }
    const night = { id: 'night-1', trip_id: 'trip-1', previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map' as const, name: 'Nuit', latitude: 48.2, longitude: 2.2, address: null, google_place_id: null, notes: null, check_in_time: null, check_out_time: null }
    const departure = { id: 'departure-1', trip_id: 'trip-1', place_id: null, name: 'Départ', latitude: 48, longitude: 2, address: null, notes: null, departure_time: null }
    const arrival = { id: 'arrival-1', trip_id: 'trip-1', place_id: null, name: 'Arrivée', latitude: 49.1, longitude: 3.1, address: null, notes: null }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure, arrival, nights: [night], days: [firstDay, secondDay] } satisfies Trip
    const { container } = render(<PoiMap places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 6 }} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} focusRequest={null} layoutKey="selected-night" onPopupClose={vi.fn()} basemapId="cartavault-light" onBasemapTileError={vi.fn()} trip={trip} tripViewOnly activeTripDayId="day-1" activeTripNightTarget={{ nightId: 'night-1', previousDayId: 'day-1', nextDayId: 'day-2' }} selectedTripTimelineKey="night:night-1" />)

    await waitFor(() => expect(container.querySelector('.leaflet-overlay-pane path[stroke="#0FA68A"][stroke-width="6"]')).toBeInTheDocument())
    expect(container.querySelector('.leaflet-overlay-pane path[stroke="#2563EB"][stroke-width="6"]')).toBeInTheDocument()
    expect(container.querySelector('[data-endpoint-roles="end-start"]')).toBeInTheDocument()
    expect(container.querySelector('[data-endpoint-roles="end-start"] .trip-day-endpoint-icon__glyphs')).toBeInTheDocument()
    expect(container.querySelector('[data-endpoint-roles="end-start"]')).toHaveAttribute('data-arrival-side', 'left')
    expect(container.querySelector('[data-endpoint-roles="end-start"]')?.parentElement).toHaveClass('is-selected')
    expect(container.querySelector('[data-endpoint-roles="end"]')).toBeInTheDocument()
    expect(container.querySelector('[data-endpoint-roles="start"]')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.trip-day-endpoint-icon')).toHaveLength(2)
    expect(screen.getAllByLabelText('Arrivée de la journée')).toHaveLength(2)
    expect(screen.getByLabelText('Départ de la journée')).toHaveAttribute('fill', 'none')
  })

  it('places the arrival half on the side from which the previous route approaches the night', async () => {
    const firstDay = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, color: '#0FA68A', notes: null, planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed' as const, safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: 1000, route_duration_seconds: 120, visit_duration_minutes: 30, total_duration_minutes: 32, route_geometry: { type: 'LineString' as const, coordinates: [[3, 48], [2.2, 48.2]] as [number, number][] }, route_segments: [], route_status: 'ready', sort_order: 0, stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Jour 1', latitude: 48, longitude: 3, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const secondDay = { ...firstDay, id: 'day-2', day_number: 2, color: '#2563EB', sort_order: 1, route_geometry: { type: 'LineString' as const, coordinates: [[2.2, 48.2], [2, 49]] as [number, number][] }, stops: [{ ...firstDay.stops[0], id: 'stop-2', trip_day_id: 'day-2', name: 'Jour 2', latitude: 49, longitude: 2 }] }
    const night = { id: 'night-1', trip_id: 'trip-1', previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map' as const, name: 'Nuit', latitude: 48.2, longitude: 2.2, address: null, google_place_id: null, notes: null, check_in_time: null, check_out_time: null }
    const trip = { id: 'trip-1', map_id: 'map-id', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft' as const, routing_profile: 'driving' as const, low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '', completed_at: null, archived_at: null, departure: null, arrival: null, nights: [night], days: [firstDay, secondDay] } satisfies Trip
    const { container } = render(<PoiMap places={[]} selectedPlaceId={null} initialView={{ center: [48, 2], zoom: 6 }} onBoundsChange={vi.fn()} onViewChange={vi.fn()} onPlaceSelect={vi.fn()} focusRequest={null} layoutKey="right-arrival" onPopupClose={vi.fn()} basemapId="cartavault-light" onBasemapTileError={vi.fn()} trip={trip} tripViewOnly activeTripNightTarget={{ nightId: 'night-1', previousDayId: 'day-1', nextDayId: 'day-2' }} selectedTripTimelineKey="night:night-1" />)

    await waitFor(() => expect(container.querySelector('[data-endpoint-roles="end-start"]')).toBeInTheDocument())
    const marker = container.querySelector<HTMLElement>('[data-endpoint-roles="end-start"]')
    expect(marker).toHaveAttribute('data-arrival-side', 'right')
    expect(marker).toHaveStyle({ '--trip-endpoint-start-color': '#2563EB', '--trip-endpoint-end-color': '#0FA68A' })
    expect(marker?.querySelector('.lucide-play')).toBe(marker?.querySelector('.trip-day-endpoint-icon__glyphs')?.firstElementChild)
  })
})
