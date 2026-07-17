import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addTripDeparture, addTripStop, calculateTripDayRoute, deleteTripStop, getTrip, listTrips, moveTripStop, updateTripDeparture } from '../../api/trips'
import { getPlaceDetails } from '../../api/places'
import type { Trip } from '../../types/trip'
import { TripPlannerPanel } from './TripPlannerPanel'

vi.mock('../../api/trips', async () => {
  const actual = await vi.importActual<typeof import('../../api/trips')>('../../api/trips')
  return { ...actual, listTrips: vi.fn(), getTrip: vi.fn(), addTripDeparture: vi.fn(), updateTripDeparture: vi.fn(), addTripStop: vi.fn(), deleteTripStop: vi.fn(), moveTripStop: vi.fn(), calculateTripDayRoute: vi.fn() }
})
vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn() }))

const trip: Trip = {
  id: 'trip-1', map_id: 'map-1', created_by_user_id: 'user-1', name: 'Voyage test', description: null,
  start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', created_at: '', updated_at: '',
  completed_at: null, archived_at: null, nights: [], departure: null,
  days: [{ id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, notes: null,
    planned_start_time: null, planned_end_time: null, max_total_duration_minutes: null, route_distance_meters: null,
    route_duration_seconds: null, visit_duration_minutes: 0, total_duration_minutes: 0, route_geometry: null,
    route_segments: null, route_status: null, sort_order: 0, stops: [] }],
}

describe('TripPlannerPanel', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.mocked(listTrips).mockResolvedValue([trip])
    vi.mocked(getTrip).mockResolvedValue(trip)
    vi.mocked(addTripStop).mockResolvedValue({} as never)
    vi.mocked(deleteTripStop).mockResolvedValue(undefined)
    vi.mocked(moveTripStop).mockResolvedValue(trip)
    vi.mocked(calculateTripDayRoute).mockResolvedValue(trip.days[0])
  })

  it('renders as the right workspace panel and not as a modal', async () => {
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={null} activeDayId={null} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('map-sidebar', 'trip-planner-panel')
    expect(container.querySelector('.trip-planner-overlay')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer une sortie' }))
    expect(screen.getByRole('dialog', { name: 'Préparer une sortie' })).toBeVisible()
  })

  it('accepts a POI dragged from the Places panel into a day', async () => {
    const onTripChange = vi.fn()
    const onActiveDayChange = vi.fn()
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={onTripChange} onActiveDayChange={onActiveDayChange} onClose={vi.fn()} />)
    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('trip-1'))
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
    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('trip-1'))
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

  it('edits the fixed departure without deleting it first', async () => {
    const withDeparture = { ...trip, departure: { id: 'departure-1', trip_id: 'trip-1', place_id: null, name: 'Ancien départ', latitude: 48, longitude: 2, address: null, notes: null, departure_time: null } } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withDeparture]); vi.mocked(getTrip).mockResolvedValue(withDeparture); vi.mocked(updateTripDeparture).mockResolvedValue(withDeparture.departure)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withDeparture} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le point de départ' }))
    expect(screen.getByRole('dialog', { name: 'Modifier le point de départ' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateTripDeparture).toHaveBeenCalledWith('departure-1', expect.objectContaining({ name: 'Ancien départ', latitude: 48, longitude: 2 })))
  })

  it('presents the free location action as a ghost stop entry', () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', name: 'Belgique', country: { iso_alpha2: 'BE' }, effective_center_latitude: 50.5, effective_center_longitude: 4.5, can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Lieu libre/ })).toHaveClass('trip-panel-free-stop')
    fireEvent.click(screen.getByRole('button', { name: /Lieu libre/ }))
    expect(screen.getByRole('dialog', { name: 'Ajouter un lieu libre' })).toBeVisible()
  })
})
