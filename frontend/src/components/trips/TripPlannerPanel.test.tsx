import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addTripDeparture, addTripStop, calculateTripDayRoute, confirmTripOptimization, deleteTripStop, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTripDay, updateTripDeparture } from '../../api/trips'
import { getPlaceDetails } from '../../api/places'
import type { Trip } from '../../types/trip'
import { TripPlannerPanel } from './TripPlannerPanel'

vi.mock('../../api/trips', async () => {
  const actual = await vi.importActual<typeof import('../../api/trips')>('../../api/trips')
  return { ...actual, listTrips: vi.fn(), getTrip: vi.fn(), getTripSummary: vi.fn(), getTripDaySummary: vi.fn(), addTripDeparture: vi.fn(), updateTripDeparture: vi.fn(), addTripStop: vi.fn(), deleteTripStop: vi.fn(), moveTripStop: vi.fn(), calculateTripDayRoute: vi.fn(), optimizeTripDay: vi.fn(), confirmTripOptimization: vi.fn() }
})
vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn() }))

const trip: Trip = {
  id: 'trip-1', map_id: 'map-1', created_by_user_id: 'user-1', name: 'Voyage test', description: null,
  start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626', created_at: '', updated_at: '',
  completed_at: null, archived_at: null, nights: [], departure: null,
  days: [{ id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, notes: null,
    planned_start_time: null, planned_end_time: null, target_arrival_time: null, default_stop_buffer_minutes: 0, safety_margin_type: 'fixed', safety_margin_value: 0, max_total_duration_minutes: null, route_distance_meters: null,
    route_duration_seconds: null, visit_duration_minutes: 0, total_duration_minutes: 0, route_geometry: null,
    route_segments: null, route_status: null, sort_order: 0, stops: [] }],
}

const emptySummary = { trip_id: 'trip-1', days: 1, nights: 0, stops: 0, unique_places: 0, distance_meters: 0, route_duration_seconds: 0, visit_duration_minutes: 0, total_duration_minutes: 0, visit_status_counts: {}, total_route_distance_meters: 0, total_route_distance_km: 0, total_route_duration_seconds: 0, total_route_duration_minutes: 0, total_visit_duration_minutes: 0, total_pause_duration_minutes: 0, total_buffer_duration_minutes: 0, total_safety_margin_minutes: 0, total_estimated_duration_minutes: 0, total_planned_duration_minutes: 0, days_with_route: 0, days_without_route: 1, stale_route_days: 0, is_route_summary_complete: false, low_load_days: 0, medium_load_days: 0, high_load_days: 0, days_with_complete_time_summary: 0, days_with_incomplete_time_summary: 1, is_time_summary_complete: false }
const emptyDaySummary = { day_id: 'day-1', stops: 0, required_stops: 0, optional_stops: 0, distance_meters: null, route_distance_meters: null, route_distance_km: null, route_duration_seconds: null, route_duration_minutes: null, visit_duration_minutes: 0, pause_duration_minutes: 0 as const, buffer_duration_minutes: 0, safety_margin_minutes: null, total_duration_minutes: null, overload_minutes: 0, unroutable_segments: 0, route_status: null, route_is_stale: false, has_current_route: false, planned_start_time: null, target_arrival_time: null, recommended_start_time: null, recommended_start_day_offset: null, estimated_arrival_time: null, estimated_arrival_day_offset: null, schedule_delta_minutes: null, schedule_status: 'unavailable' as const, load_level: 'unavailable' as const, load_color: null, is_time_summary_complete: false }

describe('TripPlannerPanel', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listTrips).mockResolvedValue([trip])
    vi.mocked(getTrip).mockResolvedValue(trip)
    vi.mocked(getTripSummary).mockResolvedValue(emptySummary)
    vi.mocked(getTripDaySummary).mockImplementation(async (id) => ({ ...emptyDaySummary, day_id: id }))
    vi.mocked(addTripStop).mockResolvedValue({} as never)
    vi.mocked(deleteTripStop).mockResolvedValue(undefined)
    vi.mocked(moveTripStop).mockResolvedValue(trip)
    vi.mocked(calculateTripDayRoute).mockResolvedValue(trip.days[0])
    vi.mocked(confirmTripOptimization).mockResolvedValue(trip.days[0])
  })

  it('renders as the right workspace panel and not as a modal', async () => {
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={null} activeDayId={null} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('map-sidebar', 'trip-planner-panel')
    expect(container.querySelector('.trip-planner-overlay')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer une sortie' }))
    expect(screen.getByRole('dialog', { name: 'Préparer une sortie' })).toBeVisible()
  })

  it('organizes the workspace into summary, settings and journeys without lifecycle actions', async () => {
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true, can_delete: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Résumé du voyage')).toBeVisible()
    expect(screen.getByText('Paramètres du voyage')).toBeVisible()
    expect(screen.getByText('Trajets')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ajouter une journée' })).toBeVisible()
    expect(screen.getByText('Arrivée')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Terminer' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Paramètres du voyage'))
    expect(screen.getAllByText('Charge des journées')).toHaveLength(2)
    expect(screen.getByLabelText('Nom du voyage')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Dupliquer le voyage' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Supprimer le voyage' })).toBeVisible()
    const settings = container.querySelector<HTMLElement>('.trip-panel-settings')
    expect(settings).not.toBeNull()
    expect(within(settings!).queryByText('Options du voyage')).not.toBeInTheDocument()
    expect(within(settings!).getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(1)
    expect(within(settings!).getByLabelText('Télécharger')).toBeVisible()
  })

  it('loads the trip selected from the active trip list', async () => {
    const otherTrip = { ...trip, id: 'trip-2', name: 'Deuxième voyage', days: [{ ...trip.days[0], id: 'day-2', trip_id: 'trip-2' }] }
    const onTripChange = vi.fn()
    vi.mocked(listTrips).mockResolvedValue([trip, otherTrip])
    vi.mocked(getTrip).mockImplementation(async (id) => id === otherTrip.id ? otherTrip : trip)

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={onTripChange} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const selector = await screen.findByLabelText('Voyage actif')
    fireEvent.change(selector, { target: { value: otherTrip.id } })

    await waitFor(() => expect(onTripChange).toHaveBeenLastCalledWith(otherTrip))
  })

  it('keeps the latest requested trip when selections change rapidly', async () => {
    const secondTrip = { ...trip, id: 'trip-2', name: 'Deuxième voyage', days: [{ ...trip.days[0], id: 'day-2', trip_id: 'trip-2' }] }
    let resolveSecond: ((value: Trip) => void) | undefined
    const secondRequest = new Promise<Trip>((resolve) => { resolveSecond = resolve })
    vi.mocked(listTrips).mockResolvedValue([trip, secondTrip])
    vi.mocked(getTrip).mockImplementation(async (id) => {
      if (id === secondTrip.id) return secondRequest
      return trip
    })

    function StatefulPanel() {
      const [selectedTrip, setSelectedTrip] = useState<Trip | null>(trip)
      const [selectedDayId, setSelectedDayId] = useState<string | null>('day-1')
      return <TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={selectedTrip} activeDayId={selectedDayId} onTripChange={setSelectedTrip} onActiveDayChange={setSelectedDayId} onClose={vi.fn()} />
    }

    render(<StatefulPanel />)
    const selector = await screen.findByLabelText('Voyage actif')
    fireEvent.change(selector, { target: { value: secondTrip.id } })
    expect(await screen.findByRole('status')).toHaveTextContent('Chargement du voyage')
    fireEvent.change(selector, { target: { value: trip.id } })

    await waitFor(() => expect(selector).toHaveValue(trip.id))
    resolveSecond?.(secondTrip)
    await waitFor(() => expect(selector).toHaveValue(trip.id))
  })

  it('accepts a POI dragged from the Places panel into a day', async () => {
    const onTripChange = vi.fn()
    const onActiveDayChange = vi.fn()
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={onTripChange} onActiveDayChange={onActiveDayChange} onClose={vi.fn()} />)
    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('trip-1', expect.any(AbortSignal)))
    const day = container.querySelector('.trip-panel-day')
    expect(day).not.toBeNull()
    fireEvent.drop(day!, { dataTransfer: { getData: () => 'place:place-42' } })
    await waitFor(() => expect(addTripStop).toHaveBeenCalledWith('day-1', { place_id: 'place-42', stop_type: 'place', visit_duration_minutes: 30 }))
  })

  it('opens the night modal prefilled when a POI is dropped between two days', async () => {
    const twoDays = { ...trip, days: [...trip.days, { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }] }
    vi.mocked(listTrips).mockResolvedValue([twoDays])
    vi.mocked(getTrip).mockResolvedValue(twoDays)
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'hotel-poi', name: 'Hôtel POI', latitude: 50, longitude: 4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDays} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    fireEvent.drop(container.querySelector('.trip-panel-night:not(.trip-panel-departure)')!, { dataTransfer: { getData: () => 'place:hotel-poi' } })
    expect(await screen.findByRole('dialog', { name: 'Ajouter un hébergement' })).toBeVisible()
    expect(await screen.findByText('Hôtel POI')).toBeVisible()
  })

  it('adds a fixed departure before day one from a dropped POI', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'departure-poi', name: 'Maison', latitude: 50, longitude: 4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    vi.mocked(addTripDeparture).mockResolvedValue({} as never)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    fireEvent.drop(container.querySelector('.trip-panel-departure')!, { dataTransfer: { getData: () => 'place:departure-poi' } })
    expect(await screen.findByRole('dialog', { name: 'Ajouter le point de départ' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le départ' }))
    await waitFor(() => expect(addTripDeparture).toHaveBeenCalledWith('trip-1', expect.objectContaining({ place_id: 'departure-poi' })))
  })

  it('removes a stop and reloads the active trip', async () => {
    const withStop = {
      ...trip,
      days: [{
        ...trip.days[0],
        stops: [{
          id: 'stop-1', trip_day_id: 'day-1', place_id: 'place-1', stop_type: 'place', name: 'POI à retirer',
          latitude: 50, longitude: 4, address: null, sort_order: 0, visit_duration_minutes: 30,
          notes: null, is_required: true, is_locked: false, visit_status: 'planned',
        }],
      }],
    } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStop])
    vi.mocked(getTrip).mockResolvedValue(withStop)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStop} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer l’étape' }))

    await waitFor(() => expect(deleteTripStop).toHaveBeenCalledWith('stop-1'))
    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('trip-1', expect.any(AbortSignal)))
  })

  it('focuses the map when a stop is selected and hides visit status controls', async () => {
    const onStopFocus = vi.fn()
    const withStop = { ...trip, days: [{ ...trip.days[0], stops: [{ id: 'stop-focus', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location', name: 'Belvédère', latitude: 42.4, longitude: 3.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' }] }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStop]); vi.mocked(getTrip).mockResolvedValue(withStop)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStop} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onStopFocus={onStopFocus} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Belvédère/ }))
    expect(onStopFocus).toHaveBeenCalledWith(42.4, 3.1)
    expect(screen.queryByRole('combobox', { name: /Visite/ })).not.toBeInTheDocument()
  })

  it('shows a precise insertion bar and moves the dragged stop to that position', async () => {
    const stops = [0, 1].map((index) => ({ id: `stop-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const withStops = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStops]); vi.mocked(getTrip).mockResolvedValue(withStops)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStops} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const source = screen.getByRole('button', { name: /Étape 0/ }).closest('li')!
    const target = screen.getByRole('button', { name: /Étape 1/ }).closest('li')!
    const dataTransfer = { effectAllowed: '', setData: vi.fn(), getData: () => 'stop:stop-0' }
    fireEvent.dragStart(source, { dataTransfer })
    expect(source).toHaveClass('is-dragging')
    fireEvent.dragOver(target, { dataTransfer, clientY: 0 })
    expect(target).toHaveClass('drop-before')
    fireEvent.drop(target, { dataTransfer })
    await waitFor(() => expect(moveTripStop).toHaveBeenCalledWith('stop-0', 'day-1', 1))
  })

  it('confirms a refreshed itinerary directly on the button', async () => {
    const withStops = { ...trip, days: [{ ...trip.days[0], stops: [0, 1].map((index) => ({ id: `route-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Route ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const })) }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStops]); vi.mocked(getTrip).mockResolvedValue(withStops)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStops} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Itinéraire' }))
    expect(await screen.findByRole('button', { name: 'Itinéraire rafraîchi' })).toHaveClass('route-success')
  })

  it('separates daily and global route metrics from visits', async () => {
    const routed = { ...trip, days: [{ ...trip.days[0], route_status: 'ready', route_distance_meters: 184_300, route_duration_seconds: 13_320, visit_duration_minutes: 330, stops: [{ id: 'visit-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Visite', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 330, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([routed]); vi.mocked(getTrip).mockResolvedValue(routed)
    vi.mocked(getTripSummary).mockResolvedValue({ ...emptySummary, stops: 1, distance_meters: 184_300, route_duration_seconds: 13_320, visit_duration_minutes: 330, total_duration_minutes: 552, visit_status_counts: { planned: 1 }, total_route_distance_meters: 184_300, total_route_distance_km: 184.3, total_route_duration_seconds: 13_320, total_route_duration_minutes: 222, total_visit_duration_minutes: 330, total_estimated_duration_minutes: 552, total_planned_duration_minutes: 552, days_with_route: 1, days_without_route: 0, is_route_summary_complete: true, medium_load_days: 1, days_with_complete_time_summary: 1, days_with_incomplete_time_summary: 0, is_time_summary_complete: true })
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, stops: 1, required_stops: 1, distance_meters: 184_300, route_distance_meters: 184_300, route_distance_km: 184.3, route_duration_seconds: 13_320, route_duration_minutes: 222, visit_duration_minutes: 330, safety_margin_minutes: 0, total_duration_minutes: 552, route_status: 'ready', has_current_route: true, load_level: 'medium', load_color: '#D97706', is_time_summary_complete: true })

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={routed} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('Résumé du voyage'))
    fireEvent.click(screen.getByText('Bilan de la journée'))
    expect(await screen.findByLabelText('Distance totale de route : 184,3 km')).toBeVisible()
    expect(screen.getByLabelText('Temps total de conduite : 3 h 42')).toBeVisible()
    expect(screen.getAllByLabelText('Visites : 5 h 30')).toHaveLength(2)
    expect(screen.getByLabelText('Durée totale estimée : 9 h 12')).toBeVisible()
    expect(screen.getByLabelText('Total : 9 h 12')).toBeVisible()
  })

  it('marks stale routes as unavailable and the global summary as partial', async () => {
    const staleTrip = { ...trip, days: [{ ...trip.days[0], route_status: 'stale', route_distance_meters: 184_300, route_duration_seconds: 13_320 }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([staleTrip]); vi.mocked(getTrip).mockResolvedValue(staleTrip)
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, route_status: 'stale', route_is_stale: true })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={staleTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Itinéraire à recalculer')).toBeVisible()
    fireEvent.click(screen.getByText('Résumé du voyage'))
    expect(screen.getByText(/Résumé partiel/)).toBeVisible()
    expect(screen.queryByText('184,3 km')).not.toBeInTheDocument()
  })

  it('compares optimization distance and driving time before confirmation', async () => {
    const stops = [0, 1].map((index) => ({ id: `opt-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const optimizable = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([optimizable]); vi.mocked(getTrip).mockResolvedValue(optimizable)
    vi.mocked(optimizeTripDay).mockResolvedValue({ manual_stop_ids: ['opt-0', 'opt-1'], optimized_stop_ids: ['opt-1', 'opt-0'], before: 17_520, after: 14_880, gain: 2_640, metric: 'duration', before_distance_meters: 214_000, after_distance_meters: 176_000, distance_gain_meters: 38_000, before_duration_seconds: 17_520, after_duration_seconds: 14_880, duration_gain_seconds: 2_640 })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={optimizable} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Optimiser' }))

    expect(await screen.findByText('Distance : 214 km')).toBeVisible()
    expect(screen.getByText('Conduite : 4 h 52')).toBeVisible()
    expect(screen.getByText('Distance : 176 km')).toBeVisible()
    expect(screen.getByText('Conduite : 4 h 08')).toBeVisible()
    expect(screen.getByText('Distance : 38 km')).toBeVisible()
    expect(screen.getByText('Conduite : 44 min')).toBeVisible()
  })

  it('edits the fixed departure without deleting it first', async () => {
    const withDeparture = { ...trip, departure: { id: 'departure-1', trip_id: 'trip-1', place_id: null, name: 'Ancien départ', latitude: 48, longitude: 2, address: null, notes: null, departure_time: null } } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withDeparture]); vi.mocked(getTrip).mockResolvedValue(withDeparture); vi.mocked(updateTripDeparture).mockResolvedValue(withDeparture.departure)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withDeparture} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le point de départ' }))
    expect(screen.getByRole('dialog', { name: 'Modifier le point de départ' })).toBeVisible()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Modifier le point de départ' })).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateTripDeparture).toHaveBeenCalledWith('departure-1', expect.objectContaining({ name: 'Ancien départ', latitude: 48, longitude: 2 })))
  })

  it('presents the free location action as a ghost stop entry', () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', name: 'Belgique', country: { iso_alpha2: 'BE' }, effective_center_latitude: 50.5, effective_center_longitude: 4.5, can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Lieu libre/ })).toHaveClass('trip-panel-free-stop')
    fireEvent.click(screen.getByRole('button', { name: /Lieu libre/ }))
    expect(screen.getByRole('dialog', { name: 'Ajouter un lieu libre' })).toBeVisible()
  })
})
