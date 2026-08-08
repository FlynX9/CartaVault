import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addTripArrival, addTripDay, addTripDeparture, addTripNight, addTripStop, archiveTrip, calculateTripDayRoute, confirmTripOptimization, confirmTripOptimizations, deleteTripArrival, deleteTripDeparture, deleteTripNight, deleteTripStop, downloadTripExport, exportTripGpx, exportTripPdf, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTrip, optimizeTripDay, reorderTripDays, unarchiveTrip, updateTrip, updateTripArrival, updateTripDay, updateTripDeparture, updateTripNight } from '../../api/trips'
import { getPlaceDetails } from '../../api/places'
import type { Trip } from '../../types/trip'
import { TripPlannerPanel } from './TripPlannerPanel'

vi.mock('../../api/trips', async () => {
  const actual = await vi.importActual<typeof import('../../api/trips')>('../../api/trips')
  return { ...actual, listTrips: vi.fn(), getTrip: vi.fn(), getTripSummary: vi.fn(), getTripDaySummary: vi.fn(), addTripArrival: vi.fn(), addTripDay: vi.fn(), addTripDeparture: vi.fn(), addTripNight: vi.fn(), updateTrip: vi.fn(), updateTripArrival: vi.fn(), updateTripDay: vi.fn(), updateTripDeparture: vi.fn(), updateTripNight: vi.fn(), addTripStop: vi.fn(), deleteTripArrival: vi.fn(), deleteTripDeparture: vi.fn(), deleteTripNight: vi.fn(), deleteTripStop: vi.fn(), moveTripStop: vi.fn(), reorderTripDays: vi.fn(), archiveTrip: vi.fn(), unarchiveTrip: vi.fn(), calculateTripDayRoute: vi.fn(), optimizeTrip: vi.fn(), optimizeTripDay: vi.fn(), confirmTripOptimization: vi.fn(), confirmTripOptimizations: vi.fn(), exportTripGpx: vi.fn(), exportTripPdf: vi.fn(), downloadTripExport: vi.fn() }
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
const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve })
  return { promise, resolve }
}

describe('TripPlannerPanel', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listTrips).mockResolvedValue([trip])
    vi.mocked(getTrip).mockResolvedValue(trip)
    vi.mocked(getTripSummary).mockResolvedValue(emptySummary)
    vi.mocked(getTripDaySummary).mockImplementation(async (id) => ({ ...emptyDaySummary, day_id: id }))
    vi.mocked(updateTrip).mockResolvedValue(trip)
    vi.mocked(addTripStop).mockResolvedValue({} as never)
    vi.mocked(addTripDeparture).mockResolvedValue({} as never)
    vi.mocked(addTripArrival).mockResolvedValue({} as never)
    vi.mocked(updateTripDeparture).mockResolvedValue({} as never)
    vi.mocked(updateTripArrival).mockResolvedValue({} as never)
    vi.mocked(addTripNight).mockResolvedValue({} as never)
    vi.mocked(updateTripNight).mockResolvedValue({} as never)
    vi.mocked(deleteTripNight).mockResolvedValue(undefined)
    vi.mocked(addTripDay).mockResolvedValue({ ...trip.days[0], id: 'day-new', day_number: 2, sort_order: 1 })
    vi.mocked(deleteTripStop).mockResolvedValue(undefined)
    vi.mocked(moveTripStop).mockResolvedValue(trip)
    vi.mocked(reorderTripDays).mockResolvedValue(trip)
    vi.mocked(archiveTrip).mockResolvedValue({ ...trip, status: 'completed', completed_at: '2026-07-27T12:00:00' })
    vi.mocked(unarchiveTrip).mockResolvedValue({ ...trip, status: 'in_progress' })
    vi.mocked(calculateTripDayRoute).mockResolvedValue(trip.days[0])
    vi.mocked(confirmTripOptimization).mockResolvedValue(trip.days[0])
    vi.mocked(confirmTripOptimizations).mockResolvedValue(trip)
    vi.mocked(exportTripGpx).mockResolvedValue({ export_id: 'export-1', file_name: 'voyage.gpx', download_url: '/trips/exports/export-1', expires_at: '' })
    vi.mocked(exportTripPdf).mockResolvedValue({ export_id: 'export-pdf', file_name: 'voyage.pdf', download_url: '/trips/exports/export-pdf', expires_at: '' })
    vi.mocked(downloadTripExport).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  })

  it('renders as the right workspace panel and not as a modal', async () => {
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={null} activeDayId={null} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('map-sidebar', 'trip-planner-panel')
    const header = screen.getByRole('button', { name: 'Réduire le panneau Sortie' }).closest('header')
    expect(header).toHaveClass('trip-panel-header', 'places-redesign-header')
    expect(header?.querySelector('.places-redesign-title-row')).toBeInTheDocument()
    expect(header?.querySelector('.places-redesign-header-actions')).toBeInTheDocument()
    const scrollRegion = screen.getByRole('region', { name: 'Contenu de la sortie' })
    expect(scrollRegion).toHaveClass('trip-panel-scroll')
    expect(scrollRegion).toContainElement(screen.getByLabelText('Voyage actif'))
    expect(scrollRegion).not.toContainElement(header)
    expect(container.querySelector('.trip-planner-overlay')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer une sortie' }))
    expect(screen.getByRole('dialog', { name: 'Préparer une sortie' })).toBeVisible()
  })

  it('matches the places header hierarchy and keeps the day count current', () => {
    const { rerender } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const header = screen.getByRole('button', { name: 'Réduire le panneau Sortie' }).closest('header')
    expect(header).toHaveClass('places-redesign-header')
    expect(header?.querySelector('.places-redesign-title-row')).toBeInTheDocument()
    expect(header?.querySelector('.places-redesign-map-meta')).toBeInTheDocument()
    expect(header?.querySelector('.places-redesign-header-actions')).toBeInTheDocument()
    expect(within(header as HTMLElement).getByRole('heading', { name: 'Sortie' })).toBeVisible()
    expect(within(header as HTMLElement).getByText('En cours')).toHaveClass('places-redesign-count')
    expect(within(header as HTMLElement).getByText('Voyage test')).toBeVisible()
    expect(within(header as HTMLElement).getByText('1 jour')).toBeVisible()

    const twoDayTrip = { ...trip, days: [...trip.days, { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }] }
    rerender(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDayTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(within(header as HTMLElement).getByText('2 jours')).toBeVisible()
  })

  it('renders only the compact header when the panel is collapsed', () => {
    const onCollapsedChange = vi.fn()
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" collapsed onCollapsedChange={onCollapsedChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('is-collapsed')
    expect(screen.queryByRole('region', { name: 'Contenu de la sortie' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Développer le panneau Sortie' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it('shows an empty status for days and nights without associated places', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const twoDays = { ...trip, days: [trip.days[0], secondDay] }
    vi.mocked(listTrips).mockResolvedValue([twoDays])
    vi.mocked(getTrip).mockResolvedValue(twoDays)

    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDays} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const emptyStatuses = await screen.findAllByText('Vide')
    expect(emptyStatuses).toHaveLength(5)
    emptyStatuses.forEach((status) => expect(status.closest('.trip-timeline-status')).toHaveClass('trip-timeline-status--empty'))
    emptyStatuses.forEach((status) => expect(status.closest('.trip-timeline-status')?.querySelector('.lucide-circle-alert')).toBeInTheDocument())
    expect(within(container.querySelector('.trip-panel-departure') as HTMLElement).getByText('Vide')).toBeVisible()
    expect(within(container.querySelector('.trip-panel-arrival') as HTMLElement).getByText('Vide')).toBeVisible()
  })

  it('reorders days by drag and drop while keeping the following night in the same block', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const night = { id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map' as const, name: 'Nuit du premier jour', latitude: 48.5, longitude: 2.5, address: null, google_place_id: null, notes: null, check_in_time: null, check_out_time: null }
    const withNight = { ...trip, days: [trip.days[0], secondDay], nights: [night] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withNight])
    vi.mocked(getTrip).mockResolvedValue(withNight)
    vi.mocked(reorderTripDays).mockResolvedValue(withNight)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withNight} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const firstHeader = (await screen.findByText('Jour 1')).closest<HTMLElement>('summary')!
    const secondHeader = screen.getByText('Jour 2').closest<HTMLElement>('summary')!
    const firstBlock = firstHeader.closest<HTMLElement>('.trip-timeline-day-block')!
    const secondBlock = secondHeader.closest<HTMLElement>('.trip-timeline-day-block')!
    expect(firstHeader).toHaveAttribute('draggable', 'true')
    expect(within(firstBlock).getByText('Nuit du premier jour')).toBeVisible()
    expect(secondBlock.querySelector('.trip-panel-night:not(.trip-panel-arrival)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Déplacer le jour/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Monter la journée' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descendre la journée' })).not.toBeInTheDocument()

    const dataTransfer = { effectAllowed: '', setData: vi.fn(), getData: () => 'day:day-2' }
    fireEvent.dragStart(secondHeader, { dataTransfer })
    expect(secondBlock).toHaveClass('is-dragging')
    fireEvent.dragOver(firstBlock, { dataTransfer, clientY: 0 })
    expect(firstBlock).toHaveClass('drop-before')
    fireEvent.drop(firstBlock, { dataTransfer, clientY: 0 })

    await waitFor(() => expect(reorderTripDays).toHaveBeenCalledWith(trip.id, ['day-2', 'day-1']))
  })

  it('shows valid for a ready day and non-calculated when its route needs attention', async () => {
    const stop = { id: 'visit-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Visite', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }
    const readyTrip = { ...trip, days: [{ ...trip.days[0], route_status: 'ready', stops: [stop] }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([readyTrip])
    vi.mocked(getTrip).mockResolvedValue(readyTrip)
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, stops: 1, route_status: 'ready', has_current_route: true })

    const rendered = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={readyTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const validStatus = (await screen.findByText('Valide')).closest('.trip-timeline-status')
    expect(validStatus).toHaveClass('trip-timeline-status--valid')
    expect(validStatus?.querySelector('.lucide-badge-check')).toBeInTheDocument()

    rendered.unmount()
    const staleTrip = { ...readyTrip, days: [{ ...readyTrip.days[0], route_status: 'stale' }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([staleTrip])
    vi.mocked(getTrip).mockResolvedValue(staleTrip)
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, stops: 1, route_status: 'stale', route_is_stale: true })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={staleTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const pendingStatus = (await screen.findByText('Non calculé')).closest('.trip-timeline-status')
    expect(pendingStatus).toHaveClass('trip-timeline-status--pending')
    expect(pendingStatus?.querySelector('.lucide-calculator')).toBeInTheDocument()
  })

  it('organizes the workspace into summary, settings and journeys without lifecycle actions', async () => {
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true, can_delete: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Afficher plus d’infos')).toBeVisible()
    expect(screen.queryByText('Résumé du voyage')).not.toBeInTheDocument()
    expect(screen.queryByText('Paramètres de la sortie')).not.toBeInTheDocument()
    expect(screen.queryByText('Trajets')).not.toBeInTheDocument()
    const addDay = screen.getByRole('button', { name: 'Ajouter une journée après le jour 1' })
    expect(addDay).toBeVisible()
    expect(addDay.closest('.trip-panel-insert-day')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajouter une journée' })).not.toBeInTheDocument()
    const lastDay = container.querySelector('.trip-panel-day')!
    const arrival = container.querySelector('.trip-panel-arrival')!
    expect(lastDay.compareDocumentPosition(addDay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(addDay.compareDocumentPosition(arrival) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Arrivée')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Démarrer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Terminer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculer les itinéraires' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Optimiser le voyage' })).toBeVisible()
    const journeyToolbar = container.querySelector<HTMLElement>('.trip-panel-journeys-header-actions')!
    expect(journeyToolbar).not.toBeNull()
    expect(within(journeyToolbar).getAllByRole('button')).toHaveLength(4)

    const selector = screen.getByLabelText('Voyage actif').closest<HTMLElement>('.trip-panel-selector')!
    const createButton = within(selector).getByRole('button', { name: 'Créer une sortie' })
    const settingsButton = within(selector).getByRole('button', { name: 'Afficher les paramètres de la sortie' })
    const exportButton = within(selector).getByLabelText('Exporter la sortie')
    expect(within(selector).queryByRole('button', { name: 'Dupliquer cette sortie' })).not.toBeInTheDocument()
    expect(within(selector).queryByRole('button', { name: 'Archiver la sortie' })).not.toBeInTheDocument()
    expect(createButton.compareDocumentPosition(settingsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(settingsButton.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(settingsButton)
    expect(screen.getByText('Paramètres de la sortie')).toBeVisible()
    expect(screen.getAllByText('Charge des journées')).toHaveLength(2)
    expect(screen.getByLabelText('Nom du voyage')).toBeVisible()
    const settings = container.querySelector<HTMLElement>('.trip-panel-settings')
    expect(settings).not.toBeNull()
    const controls = within(settings!).getByLabelText('Contrôles de la sortie')
    expect(within(controls).getByRole('button', { name: 'Dupliquer le voyage' })).toBeVisible()
    expect(within(controls).getByRole('button', { name: 'Archiver la sortie' })).toBeVisible()
    expect(within(controls).getByRole('button', { name: 'Supprimer le voyage' })).toBeVisible()
    expect(within(settings!).getByLabelText('Charge faible jusqu’à (min)')).toBeVisible()
    expect(within(settings!).getByLabelText('Charge modérée jusqu’à (min)')).toBeVisible()
    const lowColor = within(settings!).getByLabelText('Couleur faible')
    expect(lowColor.previousElementSibling).toHaveTextContent('Couleur faible')
    expect(settings!.querySelectorAll('.trip-load-colors input[type="color"]')).toHaveLength(3)
    expect(settings!.querySelectorAll('.trip-load-preview-badge')).toHaveLength(3)
    expect(settings!.querySelectorAll('.trip-load-preview-badge .lucide-gauge')).toHaveLength(3)
    expect(within(settings!).queryByText('Options du voyage')).not.toBeInTheDocument()
    const saveButton = within(settings!).getByRole('button', { name: 'Enregistrer' })
    expect(saveButton).toHaveClass('trip-settings-control--save')
    expect(saveButton).toHaveTextContent('Enregistrer')
    expect(saveButton).toBeDisabled()
    expect(saveButton.parentElement?.lastElementChild).toBe(saveButton)
    expect(within(settings!).queryByLabelText('Télécharger')).not.toBeInTheDocument()
    expect(settings?.querySelector('.trip-panel-chevron')).not.toBeInTheDocument()
    const summary = container.querySelector('.trip-summary-shell')!
    expect(settings!.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Masquer les paramètres de la sortie'))
    expect(screen.queryByText('Paramètres de la sortie')).not.toBeInTheDocument()
  })

  it('edits both trip dates from their pencil actions', async () => {
    const datedTrip = { ...trip, start_date: '2026-08-10', end_date: '2026-08-12' } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([datedTrip])
    vi.mocked(getTrip).mockResolvedValue(datedTrip)
    vi.mocked(updateTrip).mockResolvedValue({ ...datedTrip, start_date: '2026-09-01', end_date: '2026-09-03' })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={datedTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.queryByLabelText('Date de départ du voyage')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Dates du voyage')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les paramètres de la sortie' }))

    expect(screen.queryByLabelText('Date de départ du voyage')).not.toBeInTheDocument()
    expect(await screen.findByText('10 août 2026')).toBeVisible()
    expect(screen.getByText('12 août 2026')).toBeVisible()
    expect(screen.getByLabelText('Dates du voyage')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la date de départ' }))
    expect(await screen.findByLabelText('Date de départ du voyage')).toHaveValue('2026-08-10')
    fireEvent.change(screen.getByLabelText('Date de départ du voyage'), { target: { value: '2026-09-01' } })
    expect(screen.getByText('3 sept. 2026')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la date d’arrivée' }))
    fireEvent.change(screen.getByLabelText('Date d’arrivée du voyage'), { target: { value: '2026-09-05' } })
    const saveButton = screen.getByRole('button', { name: 'Enregistrer' })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(updateTrip).toHaveBeenCalledWith('trip-1', { start_date: '2026-09-01', end_date: '2026-09-05' }))
  })

  it('warns before closing modified settings and lets the user cancel or discard them', async () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    const nameInput = screen.getByLabelText('Nom du voyage')
    await waitFor(() => expect(nameInput).toHaveValue('Voyage test'))
    fireEvent.change(nameInput, { target: { value: 'Voyage modifié' } })
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Masquer les paramètres de la sortie' }))
    const warning = screen.getByRole('alertdialog', { name: 'Enregistrer les paramètres ?' })
    expect(warning).toHaveTextContent('ne pas perdre vos changements')
    fireEvent.click(within(warning).getByRole('button', { name: 'Annuler' }))
    expect(screen.getByLabelText('Nom du voyage')).toHaveValue('Voyage modifié')

    fireEvent.click(screen.getByRole('button', { name: 'Masquer les paramètres de la sortie' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Ne pas enregistrer' }))
    await waitFor(() => expect(screen.queryByText('Paramètres de la sortie')).not.toBeInTheDocument())
    expect(updateTrip).not.toHaveBeenCalled()
  })

  it('saves modified settings from the warning before continuing', async () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    const nameInput = screen.getByLabelText('Nom du voyage')
    await waitFor(() => expect(nameInput).toHaveValue('Voyage test'))
    fireEvent.change(nameInput, { target: { value: 'Voyage sauvegardé' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les paramètres de la sortie' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateTrip).toHaveBeenCalledWith('trip-1', { name: 'Voyage sauvegardé' }))
    await waitFor(() => expect(screen.queryByText('Paramètres de la sortie')).not.toBeInTheDocument())
  })

  it('guards trip selection and exposes the same warning to application navigation', async () => {
    const secondTrip = { ...trip, id: 'trip-2', name: 'Second voyage' } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([trip, secondTrip])
    vi.mocked(getTrip).mockImplementation(async (id) => id === secondTrip.id ? secondTrip : trip)
    let navigationGuard: (() => Promise<boolean>) | null = null
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onUnsavedChangesGuardChange={(guard) => { navigationGuard = guard }} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    const nameInput = screen.getByLabelText('Nom du voyage')
    await waitFor(() => expect(nameInput).toHaveValue('Voyage test'))
    fireEvent.change(nameInput, { target: { value: 'Brouillon' } })
    await waitFor(() => expect(navigationGuard).not.toBeNull())

    fireEvent.change(screen.getByLabelText('Voyage actif'), { target: { value: secondTrip.id } })
    expect(screen.getByRole('alertdialog', { name: 'Enregistrer les paramètres ?' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByLabelText('Voyage actif')).toHaveValue(trip.id)
    expect(vi.mocked(getTrip).mock.calls.some(([id]) => id === secondTrip.id)).toBe(false)

    let canNavigate = false
    let decision!: Promise<boolean>
    act(() => { decision = navigationGuard!() })
    const navigationWarning = await screen.findByRole('alertdialog')
    fireEvent.click(within(navigationWarning).getByRole('button', { name: 'Ne pas enregistrer' }))
    await act(async () => { canNavigate = await decision })
    expect(canNavigate).toBe(true)
  })

  it('archives an active trip as completed while keeping its lifecycle visible', async () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('En cours')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Archiver la sortie' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archiver la sortie' }))

    await waitFor(() => expect(archiveTrip).toHaveBeenCalledWith('trip-1'))
    expect(screen.getByRole('combobox', { name: 'Voyage actif' })).toHaveValue('trip-1')
  })

  it('renders a completed trip as read-only and allows it to be reactivated', async () => {
    const completedTrip = { ...trip, status: 'completed', completed_at: '2026-07-27T12:00:00' } as Trip
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={completedTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Terminée')).toBeVisible()
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('trip-planner-panel--read-only')
    expect(screen.queryByRole('button', { name: 'Archiver la sortie' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réactiver la sortie' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    expect(screen.getByRole('button', { name: 'Dupliquer le voyage' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Réactiver la sortie' }))
    await waitFor(() => expect(unarchiveTrip).toHaveBeenCalledWith('trip-1'))
  })

  it('inserts a day at the selected boundary and exposes one insertion point per day', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const twoDays = { ...trip, days: [trip.days[0], secondDay] }
    vi.mocked(listTrips).mockResolvedValue([twoDays]); vi.mocked(getTrip).mockResolvedValue(twoDays)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDays} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const insertionPoints = await screen.findAllByRole('button', { name: /Ajouter une journée après le jour/ })
    expect(insertionPoints).toHaveLength(2)
    fireEvent.click(insertionPoints[0])
    await waitFor(() => expect(addTripDay).toHaveBeenCalledWith('trip-1', { after_day_id: 'day-1' }))
  })

  it('exports GPX from the compact export menu', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByLabelText('Exporter la sortie'))
    expect(screen.getByRole('menu', { name: 'Options d’export' })).toBeVisible()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter en GPX' }))

    await waitFor(() => expect(exportTripGpx).toHaveBeenCalledWith('trip-1'))
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/trips/exports/export-1'), '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })

  it('exports a PDF travel booklet from the compact export menu', async () => {
    const createObjectUrl = vi.fn(() => 'blob:cartavault-pdf')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })
    let downloadedFileName = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedFileName = this.download })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByLabelText('Exporter la sortie'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Exporter en PDF' }))
    expect(screen.getByRole('dialog', { name: 'Options d’export' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter le PDF' }))

    await waitFor(() => expect(exportTripPdf).toHaveBeenCalledWith('trip-1', {
      include_overview_map: true,
      include_place_images: true,
      include_navigation_qr_codes: true,
      navigation_providers: ['google_maps'],
    }))
    await waitFor(() => expect(downloadTripExport).toHaveBeenCalledWith('/trips/exports/export-pdf'))
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(downloadedFileName).toBe('voyage.pdf')
    expect(screen.queryByRole('dialog', { name: 'Options d’export' })).not.toBeInTheDocument()
    click.mockRestore()
  })

  it('switches from the full planner to the compact trip summary from the header', async () => {
    const onTripViewOnlyChange = vi.fn()
    const { container, rerender } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" tripViewOnly={false} onTripViewOnlyChange={onTripViewOnlyChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const viewButton = await screen.findByRole('button', { name: 'Activer la chronologie du voyage' })
    expect(viewButton).toHaveAttribute('title', 'Chronologie du voyage')
    expect(viewButton.querySelector('.tabler-icon-timeline-event')).toBeInTheDocument()
    const collapseButton = screen.getByRole('button', { name: 'Réduire le panneau Sortie' })
    expect(collapseButton.querySelector('.tabler-icon-minimize')).toBeInTheDocument()
    expect(viewButton.compareDocumentPosition(collapseButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(viewButton)
    expect(onTripViewOnlyChange).toHaveBeenCalledWith(true)

    rerender(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" tripViewOnly onTripViewOnlyChange={onTripViewOnlyChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(container.querySelector('.trip-planner-panel')).toHaveClass('trip-planner-panel--trip-view')
    expect(screen.getByRole('heading', { name: 'Chronologie' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Réduire le panneau Sortie' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitter la chronologie du voyage' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Afficher plus d’infos')).not.toBeInTheDocument()
    expect(screen.getByText('Distance totale')).toBeVisible()
    expect(screen.getByText('Temps de trajet')).toBeVisible()
    expect(screen.getByText('Temps total')).toBeVisible()
    expect(screen.getByText('Temps de visite')).toBeVisible()
    expect(document.querySelector('.trip-panel-header .trip-summary-shell')).toBeVisible()
    expect(document.querySelector('.trip-panel-compact-summary .trip-summary-shell')).not.toBeInTheDocument()
    expect(screen.queryByText('Paramètres de la sortie')).not.toBeInTheDocument()
    expect(screen.queryByText('Trajets')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Voyage actif')).not.toBeInTheDocument()
  })

  it('keeps empty days readable and marks missing stops and nights', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1, color: '#2563EB' }
    const emptyPreview = { ...trip, days: [trip.days[0], secondDay], nights: [] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([emptyPreview])
    vi.mocked(getTrip).mockResolvedValue(emptyPreview)

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={emptyPreview} activeDayId="day-1" tripViewOnly onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByRole('img', { name: 'Jour 1 sans étape' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Jour 2 sans étape' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Nuit 1 non renseignée' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).toHaveClass('is-empty')
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).toHaveClass('is-empty')
  })

  it('navigates the interactive preview timeline and focuses its stops on the map', async () => {
    const firstDay = { ...trip.days[0], stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: 'place-1', stop_type: 'place' as const, name: 'Musée', latitude: 48.1, longitude: 2.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }], route_segments: [{ from: 'departure:departure-1', to: 'stop:stop-1', distance_meters: 3_500, duration_seconds: 420, routable: true }, { from: 'stop:stop-1', to: 'night:night-1', distance_meters: 4_200, duration_seconds: 480, routable: true }] }
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1, color: '#2563EB', stops: [{ id: 'stop-2', trip_day_id: 'day-2', place_id: null, stop_type: 'free_location' as const, name: 'Belvédère', latitude: 48.2, longitude: 2.2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }], route_segments: [{ from: 'night:night-1', to: 'stop:stop-2', distance_meters: 6_100, duration_seconds: 720, routable: true }, { from: 'stop:stop-2', to: 'arrival:departure-1', distance_meters: 7_300, duration_seconds: 660, routable: true }] }
    const previewTrip: Trip = {
      ...trip,
      days: [firstDay, secondDay],
      departure: { id: 'departure-1', trip_id: trip.id, place_id: 'station-1', name: 'Gare', latitude: 48, longitude: 2, address: null, notes: null, departure_time: '08:00:00' },
      arrival: null,
      nights: [{ id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'hotel-1', source_type: 'place', name: 'Hôtel Central', latitude: 48.15, longitude: 2.15, address: null, google_place_id: null, notes: null, check_in_time: '20:30:00', check_out_time: null }],
    }
    vi.mocked(listTrips).mockResolvedValue([previewTrip])
    vi.mocked(getTrip).mockResolvedValue(previewTrip)
    vi.mocked(getTripSummary).mockResolvedValue({ ...emptySummary, days: 2, nights: 1, stops: 2 })
    const onActiveDayChange = vi.fn()
    const onActiveNightTargetChange = vi.fn()
    const onStopFocus = vi.fn()
    const onStopPlaceSelect = vi.fn()
    const onPreviewStopSelect = vi.fn()

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={previewTrip} activeDayId="day-1" tripViewOnly onTripChange={vi.fn()} onActiveDayChange={onActiveDayChange} onActiveNightTargetChange={onActiveNightTargetChange} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} onPreviewStopSelect={onPreviewStopSelect} onClose={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Frise interactive du voyage' })).toHaveClass('visually-hidden')
    expect(screen.getByRole('button', { name: 'Départ : Gare' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).toHaveStyle({ '--trip-preview-color': firstDay.color, '--trip-preview-next-color': secondDay.color })
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).not.toHaveClass('is-active')
    expect(document.querySelectorAll('.trip-preview-day-label')).toHaveLength(2)
    expect(document.querySelector('.trip-preview-day-label')).toHaveTextContent('Jour 1')
    expect(document.querySelector('.trip-preview-anchor--day')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuit 1 : Hôtel Central' })).toHaveStyle({ '--trip-preview-night-previous-color': firstDay.color, '--trip-preview-night-next-color': secondDay.color })
    expect(screen.queryByText('Hôtel Central')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arrivée : Gare' })).toBeVisible()

    const museum = screen.getByRole('button', { name: 'Étape 1 : Musée' })
    const dragCenterDeparture = screen.getByRole('button', { name: 'Départ : Gare' })
    const timelineViewport = document.querySelector<HTMLElement>('.trip-preview-viewport')!
    const timelineCenterGuide = document.querySelector<HTMLElement>('.trip-preview-center-guide')!
    expect(timelineCenterGuide).toHaveStyle({ color: firstDay.color ?? '#0FA68A' })
    const centerScroll = vi.fn()
    const capturedPointers = new Set<number>()
    const setPointerCapture = vi.fn((pointerId: number) => capturedPointers.add(pointerId))
    Object.defineProperty(timelineViewport, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(timelineViewport, 'scrollTo', { configurable: true, value: centerScroll })
    Object.defineProperty(timelineViewport, 'setPointerCapture', { configurable: true, value: setPointerCapture })
    Object.defineProperty(timelineViewport, 'hasPointerCapture', { configurable: true, value: (pointerId: number) => capturedPointers.has(pointerId) })
    Object.defineProperty(timelineViewport, 'releasePointerCapture', { configurable: true, value: (pointerId: number) => capturedPointers.delete(pointerId) })
    vi.spyOn(timelineViewport, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, right: 400, bottom: 100, left: 0, width: 400, height: 100, toJSON: () => ({}) })
    vi.spyOn(timelineCenterGuide, 'getBoundingClientRect').mockReturnValue({ x: 179.5, y: 0, top: 0, right: 180.5, bottom: 100, left: 179.5, width: 1, height: 100, toJSON: () => ({}) })
    vi.spyOn(dragCenterDeparture, 'getBoundingClientRect').mockReturnValue({ x: 170, y: 0, top: 0, right: 190, bottom: 20, left: 170, width: 20, height: 20, toJSON: () => ({}) })
    vi.spyOn(museum, 'getBoundingClientRect').mockImplementation(() => { const left = 500 - timelineViewport.scrollLeft; return { x: left, y: 0, top: 0, right: left + 20, bottom: 20, left, width: 20, height: 20, toJSON: () => ({}) } })
    timelineViewport.scrollLeft = 40
    fireEvent.pointerDown(timelineViewport, { button: 0, clientX: 300, pointerId: 7, isPrimary: true })
    fireEvent.pointerMove(timelineViewport, { clientX: 240, pointerId: 7, isPrimary: true })
    expect(timelineViewport).toHaveClass('is-dragging')
    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(timelineViewport.scrollLeft).toBe(100)
    fireEvent.pointerUp(timelineViewport, { clientX: 240, pointerId: 7, isPrimary: true })
    expect(timelineViewport).not.toHaveClass('is-dragging')
    fireEvent.click(timelineViewport)
    await waitFor(() => expect(dragCenterDeparture).toHaveAttribute('aria-current', 'step'))
    timelineViewport.scrollLeft = 0
    setPointerCapture.mockClear()
    fireEvent.pointerDown(museum, { button: 0, clientX: 200, pointerId: 8, isPrimary: true })
    fireEvent.pointerUp(museum, { clientX: 200, pointerId: 8, isPrimary: true })
    fireEvent.click(museum)
    expect(setPointerCapture).not.toHaveBeenCalled()
    await waitFor(() => expect(centerScroll).toHaveBeenCalledWith({ left: 330, behavior: 'smooth' }))
    await waitFor(() => expect(timelineViewport.scrollLeft).toBe(330))
    expect(museum).toHaveAttribute('aria-current', 'step')
    expect(museum.querySelector('.trip-preview-stop-label')).not.toBeInTheDocument()
    const selectedLegCard = screen.getByLabelText('Musée vers Hôtel Central : 4,2 km, 8 min')
    expect(selectedLegCard).toBeVisible()
    expect(within(selectedLegCard).getByText('Départ')).toBeVisible()
    expect(within(selectedLegCard).getByText('Arrivée')).toBeVisible()
    expect(selectedLegCard.querySelector('.trip-preview-leg-card__metric-values')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).not.toHaveClass('is-active')
    expect(onActiveDayChange).toHaveBeenCalledWith('day-1')
    expect(onStopFocus).not.toHaveBeenCalled()
    expect(onPreviewStopSelect).toHaveBeenCalledWith('stop-1')
    expect(onStopPlaceSelect).not.toHaveBeenCalled()

    const secondDayButton = screen.getByRole('button', { name: 'Jour 2' })
    const secondDayGroup = secondDayButton.closest<HTMLElement>('.trip-preview-day-group')!
    vi.spyOn(secondDayGroup, 'getBoundingClientRect').mockImplementation(() => { const left = 890 - timelineViewport.scrollLeft; return { x: left, y: 0, top: 0, right: left + 160, bottom: 100, left, width: 160, height: 100, toJSON: () => ({}) } })
    centerScroll.mockClear()
    fireEvent.click(secondDayButton)
    await waitFor(() => expect(centerScroll).toHaveBeenCalledWith({ left: 790, behavior: 'smooth' }))
    await waitFor(() => expect(timelineViewport.scrollLeft).toBe(790))
    expect(secondDayGroup).toHaveClass('is-active')
    fireEvent.click(museum)
    await waitFor(() => expect(museum).toHaveAttribute('aria-current', 'step'))

    onActiveDayChange.mockClear()
    const selectPreviousPoint = () => fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const selectNextPoint = () => fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.queryByRole('button', { name: 'Sélectionner le point précédent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sélectionner le point suivant' })).not.toBeInTheDocument()
    const departure = screen.getByRole('button', { name: 'Départ : Gare' })
    const night = screen.getByRole('button', { name: 'Nuit 1 : Hôtel Central' })
    const arrival = screen.getByRole('button', { name: 'Arrivée : Gare' })

    selectPreviousPoint()
    expect(departure).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Gare vers Musée : 3,5 km, 7 min')).toBeVisible()
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith(null)
    expect(onActiveDayChange).not.toHaveBeenCalled()

    selectNextPoint()
    expect(museum).toHaveAttribute('aria-current', 'step')

    selectNextPoint()
    expect(night).toHaveAttribute('aria-current', 'step')
    expect(timelineCenterGuide).toHaveStyle({ color: secondDay.color })
    expect(within(night).queryByText('Hôtel Central')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hôtel Central vers Belvédère : 6,1 km, 12 min')).toBeVisible()
    expect(onStopPlaceSelect).not.toHaveBeenCalledWith('hotel-1')
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).not.toHaveClass('is-active')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith(null)
    expect(onActiveDayChange).not.toHaveBeenCalled()

    const viewpoint = screen.getByRole('button', { name: 'Étape 1 : Belvédère' })
    vi.spyOn(viewpoint, 'getBoundingClientRect').mockImplementation(() => { const left = 700 - timelineViewport.scrollLeft; return { x: left, y: 0, top: 0, right: left + 20, bottom: 20, left, width: 20, height: 20, toJSON: () => ({}) } })
    timelineViewport.scrollLeft = 0
    centerScroll.mockClear()
    selectNextPoint()
    await waitFor(() => expect(timelineViewport.scrollLeft).toBe(530))
    expect(viewpoint).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Belvédère vers Gare : 7,3 km, 11 min')).toBeVisible()
    expect(viewpoint.querySelector('.trip-preview-stop-label')).not.toBeInTheDocument()
    expect(within(night).queryByText('Hôtel Central')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).toHaveClass('is-active')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith('stop-2')
    expect(onActiveDayChange).not.toHaveBeenCalled()

    selectNextPoint()
    expect(arrival).toHaveAttribute('aria-current', 'step')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith(null)
    expect(onActiveDayChange).not.toHaveBeenCalled()

    selectPreviousPoint()
    expect(viewpoint).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Jour 2' }).closest('.trip-preview-day-group')).toHaveClass('is-active')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith('stop-2')
    expect(onActiveDayChange).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(night).toHaveAttribute('aria-current', 'step')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith(null)
    expect(onActiveDayChange).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(museum).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Jour 1' }).closest('.trip-preview-day-group')).toHaveClass('is-active')
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith('stop-1')
    expect(onActiveDayChange).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(night).toHaveAttribute('aria-current', 'step')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(viewpoint).toHaveAttribute('aria-current', 'step')
    expect(onActiveDayChange).not.toHaveBeenCalled()

    fireEvent.wheel(timelineViewport, { deltaY: -100, deltaMode: 0 })
    expect(night).toHaveAttribute('aria-current', 'step')
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    fireEvent.wheel(timelineViewport, { deltaY: 100, deltaMode: 0 })
    expect(viewpoint).toHaveAttribute('aria-current', 'step')

    fireEvent.click(night)
    expect(onActiveNightTargetChange).toHaveBeenCalledWith({ nightId: 'night-1', previousDayId: 'day-1', nextDayId: 'day-2' }, true)
    expect(onActiveDayChange).toHaveBeenCalledWith('day-2')
    expect(onStopFocus).not.toHaveBeenCalled()
    expect(onPreviewStopSelect).toHaveBeenLastCalledWith(null)
    expect(onStopPlaceSelect).not.toHaveBeenCalledWith('hotel-1')
  })

  it('shows route metrics between stops only for the day opened by a stop selection', async () => {
    const stops = [
      { id: 'stop-a', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Alpha', latitude: 48.1, longitude: 2.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const },
      { id: 'stop-b', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Bêta', latitude: 48.2, longitude: 2.2, address: null, sort_order: 1, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const },
      { id: 'stop-c', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Gamma', latitude: 48.3, longitude: 2.3, address: null, sort_order: 2, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const },
    ]
    const previewTrip: Trip = {
      ...trip,
      departure: { id: 'departure-1', trip_id: trip.id, place_id: null, name: 'Départ', latitude: 48, longitude: 2, address: null, notes: null, departure_time: '08:00:00' },
      days: [{ ...trip.days[0], stops, route_segments: [
        { from: 'departure:departure-1', to: 'stop:stop-a', distance_meters: 1_000, duration_seconds: 300, routable: true },
        { from: 'stop:stop-a', to: 'stop:stop-b', distance_meters: 12_500, duration_seconds: 900, routable: true },
        { from: 'stop:stop-b', to: 'stop:stop-c', distance_meters: 8_000, duration_seconds: 600, routable: true },
      ] }],
    }
    vi.mocked(listTrips).mockResolvedValue([previewTrip])
    vi.mocked(getTrip).mockResolvedValue(previewTrip)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={previewTrip} activeDayId="day-1" tripViewOnly onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const firstStop = await screen.findByRole('button', { name: 'Étape 1 : Alpha' })
    expect(screen.queryByLabelText(/Alpha vers Bêta/)).not.toBeInTheDocument()
    fireEvent.click(firstStop)

    expect(screen.getByLabelText('Alpha vers Bêta : 12,5 km, 15 min')).toBeVisible()
    expect(document.querySelectorAll('.trip-preview-leg-card')).toHaveLength(1)
    expect(firstStop).toHaveClass('has-active-connector')
    const secondStop = screen.getByRole('button', { name: 'Étape 2 : Bêta' })
    fireEvent.click(secondStop)
    expect(screen.queryByLabelText(/Alpha vers Bêta/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Bêta vers Gamma : 8,0 km, 10 min')).toBeVisible()
    expect(document.querySelectorAll('.trip-preview-leg-card')).toHaveLength(1)
    expect(secondStop).toHaveClass('has-active-connector')
  })

  it('reduces independently to a compact trip identity row and restores on demand', async () => {
    const onCollapsedChange = vi.fn()
    const { rerender } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onCollapsedChange={onCollapsedChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Réduire le panneau Sortie' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)

    rerender(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" collapsed onCollapsedChange={onCollapsedChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('complementary', { name: 'Préparation de sortie' })).toHaveClass('is-collapsed')
    expect(screen.getByText('Sortie')).toBeVisible()
    expect(screen.getByText('Voyage test')).toBeVisible()
    expect(screen.queryByLabelText('Voyage actif')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Développer le panneau Sortie' }))
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false)
  })

  it('does not expose routing details in trip settings', async () => {
    vi.mocked(getTripSummary).mockResolvedValue({ ...emptySummary, route_providers: ['google'], route_provider_labels: ['Google Routes'], country_constraint_enabled: true, constraint_country_code: 'GEO', constraint_country_name: 'Géorgie' })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', name: 'Géorgie', country: { name: 'Géorgie' }, can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher les paramètres de la sortie' }))
    expect(screen.queryByLabelText('Paramètres de routage')).not.toBeInTheDocument()
    expect(screen.queryByText('Google Routes')).not.toBeInTheDocument()
    expect(screen.queryByText('Itinéraire limité à la Géorgie')).not.toBeInTheDocument()
  })

  it('toggles the map visibility of each day independently', async () => {
    const onDayVisibilityChange = vi.fn()
    const visualTrip = { ...trip, days: [{ ...trip.days[0], route_geometry: { type: 'LineString' as const, coordinates: [[2, 48], [3, 49]] as [number, number][] } }] }
    vi.mocked(listTrips).mockResolvedValue([visualTrip]); vi.mocked(getTrip).mockResolvedValue(visualTrip)
    const { rerender } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={visualTrip} activeDayId="day-1" hiddenDayIds={new Set()} onDayVisibilityChange={onDayVisibilityChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const hideToggle = await screen.findByRole('switch', { name: 'Masquer le jour 1 sur la carte' })
    expect(hideToggle).toHaveAttribute('aria-checked', 'true')
    expect(hideToggle).toHaveClass('trip-panel-day-number', 'trip-day-visibility-bubble')
    expect(hideToggle.querySelector('.lucide-eye')).toBeInTheDocument()
    expect(hideToggle.closest('summary')?.querySelector('.trip-panel-day-actions')).not.toContainElement(hideToggle)
    const dayDetails = hideToggle.closest('details')
    const footerActions = dayDetails?.querySelector('.trip-panel-route-actions')
    expect(dayDetails?.querySelector('summary')).not.toContainElement(screen.getByRole('button', { name: 'Dupliquer la journée' }))
    expect(footerActions).toContainElement(screen.getByRole('button', { name: 'Dupliquer la journée' }))
    expect(footerActions).toContainElement(screen.getByRole('button', { name: 'Supprimer la journée' }))
    fireEvent.click(hideToggle)
    expect(onDayVisibilityChange).toHaveBeenCalledWith('day-1', false)

    rerender(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={visualTrip} activeDayId="day-1" hiddenDayIds={new Set(['day-1'])} onDayVisibilityChange={onDayVisibilityChange} onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const showToggle = screen.getByRole('switch', { name: 'Afficher le jour 1 sur la carte' })
    expect(showToggle).toHaveAttribute('aria-checked', 'false')
    expect(showToggle.querySelector('.lucide-eye-off')).toBeInTheDocument()
    fireEvent.click(showToggle)
    expect(onDayVisibilityChange).toHaveBeenLastCalledWith('day-1', true)
  })

  it('does not present an empty day as visible on the map', async () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const toggle = await screen.findByRole('switch', { name: 'Jour 1 sans contenu cartographique' })
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
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

  it('does not restart loading when parent callbacks change identity after a render', async () => {
    function ParentWithInlineCallbacks() {
      const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
      const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
      return <TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={selectedTrip} activeDayId={selectedDayId} onTripChange={(value) => setSelectedTrip(value)} onActiveDayChange={(value) => setSelectedDayId(value)} onClose={vi.fn()} />
    }

    render(<ParentWithInlineCallbacks />)
    expect(await screen.findByLabelText('Voyage actif')).toHaveValue('trip-1')
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    expect(listTrips).toHaveBeenCalledTimes(1)
    expect(getTrip).toHaveBeenCalledTimes(1)
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
    vi.mocked(listTrips).mockClear()
    onTripChange.mockClear()
    vi.mocked(getTripSummary).mockImplementationOnce(() => new Promise(() => undefined))
    fireEvent.drop(day!, { dataTransfer: { getData: () => 'place:place-42' } })
    await waitFor(() => expect(addTripStop).toHaveBeenCalledWith('day-1', { place_id: 'place-42', stop_type: 'place' }))
    await waitFor(() => expect(onTripChange).toHaveBeenCalled())
    expect(listTrips).not.toHaveBeenCalled()
    expect(screen.queryByText('Chargement du voyage…')).not.toBeInTheDocument()
  })

  it('selects a day without collapsing it, and uses its dedicated control to collapse it', async () => {
    const onActiveDayChange = vi.fn()
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId={null} onTripChange={vi.fn()} onActiveDayChange={onActiveDayChange} onClose={vi.fn()} />)
    await waitFor(() => expect(getTrip).toHaveBeenCalledWith('trip-1', expect.any(AbortSignal)))
    const day = container.querySelector('.trip-panel-day') as HTMLDetailsElement
    const header = day.querySelector('summary')!
    onActiveDayChange.mockClear()

    fireEvent.click(header)
    expect(onActiveDayChange).toHaveBeenCalledWith('day-1')
    expect(day.open).toBe(true)

    fireEvent.click(day.querySelector('.trip-panel-day-content')!)
    expect(onActiveDayChange).toHaveBeenCalledTimes(2)

    fireEvent.click(within(day).getByRole('button', { name: /Réduire le jour 1/i }))
    expect(day.open).toBe(false)
    expect(within(day).getByRole('button', { name: /Développer le jour 1/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('inserts a POI dropped on an existing stop without sending the drag prefix as a UUID', async () => {
    const existingStop = {
      id: 'stop-existing', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const,
      name: 'Étape existante', latitude: 48, longitude: 2, address: null, sort_order: 0,
      visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const,
    }
    const withStop = { ...trip, days: [{ ...trip.days[0], stops: [existingStop] }] } satisfies Trip
    const createdStop = { ...existingStop, id: 'stop-created', place_id: 'place-42', stop_type: 'place' as const, name: 'Nouveau POI' }
    vi.mocked(listTrips).mockResolvedValue([withStop])
    vi.mocked(getTrip).mockResolvedValue(withStop)
    vi.mocked(addTripStop).mockResolvedValue(createdStop)

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStop} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const target = await screen.findByRole('button', { name: /Étape existante/ })
    const dataTransfer = { getData: () => 'place:place-42' }
    fireEvent.dragOver(target.closest('li')!, { dataTransfer, clientY: 0 })
    expect(target.closest('li')).toHaveClass('drop-before')
    fireEvent.dragEnd(window)
    expect(target.closest('li')).not.toHaveClass('drop-before')
    fireEvent.dragOver(target.closest('li')!, { dataTransfer, clientY: 0 })
    fireEvent.drop(target.closest('li')!, { dataTransfer })

    await waitFor(() => expect(addTripStop).toHaveBeenCalledWith('day-1', { place_id: 'place-42', stop_type: 'place' }))
    expect(moveTripStop).toHaveBeenCalledWith('stop-created', 'day-1', 0)
    expect(moveTripStop).not.toHaveBeenCalledWith('place:place-42', expect.anything(), expect.anything())
  })

  it('creates a night directly when a POI is dropped between two days', async () => {
    const twoDays = { ...trip, days: [{ ...trip.days[0], color: '#e11d48' }, { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1, color: '#2563eb' }] }
    vi.mocked(listTrips).mockResolvedValue([twoDays])
    vi.mocked(getTrip).mockResolvedValue(twoDays)
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'hotel-poi', name: 'Hôtel POI', latitude: 50, longitude: 4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDays} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('N1')).toBeVisible()
    const nightBadge = container.querySelector<HTMLElement>('.trip-timeline-night-badge')
    expect(nightBadge?.querySelector('.lucide-moon')).toBeInTheDocument()
    const nightCard = container.querySelector<HTMLElement>('.trip-panel-night:not(.trip-panel-departure)')
    expect(nightCard?.style.getPropertyValue('--trip-night-previous-color')).toBe('#e11d48')
    expect(nightCard?.style.getPropertyValue('--trip-night-next-color')).toBe('#2563eb')
    const nightDropTarget = container.querySelector<HTMLElement>('.trip-panel-night:not(.trip-panel-departure)')!
    const dataTransfer = { types: ['text/plain'], getData: () => 'place:hotel-poi' }
    fireEvent.dragEnter(nightDropTarget, { dataTransfer })
    expect(within(nightDropTarget).getByText('Déposer ici')).toBeVisible()
    expect(within(nightDropTarget).queryByText('Glissez un POI ou utilisez la recherche de la carte')).not.toBeInTheDocument()
    fireEvent.dragLeave(nightDropTarget, { relatedTarget: document.body })
    expect(within(nightDropTarget).queryByText('Déposer ici')).not.toBeInTheDocument()
    expect(within(nightDropTarget).getByText('Glissez un POI ou utilisez la recherche de la carte')).toBeVisible()
    fireEvent.dragEnter(nightDropTarget, { dataTransfer })
    fireEvent.dragEnd(window)
    expect(within(nightDropTarget).queryByText('Déposer ici')).not.toBeInTheDocument()
    fireEvent.dragEnter(nightDropTarget, { dataTransfer })
    fireEvent.drop(nightDropTarget, { dataTransfer })
    await waitFor(() => expect(addTripNight).toHaveBeenCalledWith('trip-1', { previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'hotel-poi', source_type: 'place' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('collapses and expands a night with its dedicated control', async () => {
    const twoDays = { ...trip, days: [{ ...trip.days[0] }, { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }] }
    vi.mocked(listTrips).mockResolvedValue([twoDays])
    vi.mocked(getTrip).mockResolvedValue(twoDays)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={twoDays} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const nightCard = container.querySelector<HTMLElement>('.trip-panel-night:not(.trip-panel-departure)')!

    fireEvent.click(await within(nightCard).findByRole('button', { name: 'Réduire la nuit 1' }))
    expect(nightCard).toHaveClass('is-collapsed')
    expect(within(nightCard).queryByText('Glissez un POI ou utilisez la recherche de la carte')).not.toBeInTheDocument()

    fireEvent.click(within(nightCard).getByRole('button', { name: 'Développer la nuit 1' }))
    expect(nightCard).not.toHaveClass('is-collapsed')
    expect(within(nightCard).getByText('Glissez un POI ou utilisez la recherche de la carte')).toBeVisible()
  })

  it('removes a stop and refreshes the active trip without reloading the panel', async () => {
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
    const withoutStop = {
      ...withStop,
      days: [{ ...withStop.days[0], stops: [] }],
    } satisfies Trip
    const onTripChange = vi.fn()
    vi.mocked(listTrips).mockResolvedValue([withStop])
    vi.mocked(getTrip).mockResolvedValue(withStop)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStop} activeDayId="day-1" onTripChange={onTripChange} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() => expect(onTripChange).toHaveBeenCalledWith(withStop))
    vi.mocked(listTrips).mockClear()
    vi.mocked(getTrip).mockClear()
    onTripChange.mockClear()
    vi.mocked(getTrip).mockResolvedValue(withoutStop)

    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer l’étape' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(deleteTripStop).toHaveBeenCalledWith('stop-1'))
    await waitFor(() => expect(onTripChange).toHaveBeenCalledWith(withoutStop))
    expect(getTrip).toHaveBeenCalledWith('trip-1')
    expect(listTrips).not.toHaveBeenCalled()
    expect(screen.queryByText('Chargement du voyage…')).not.toBeInTheDocument()
  })

  it('focuses the map when a stop is selected and hides visit status controls', async () => {
    const onStopFocus = vi.fn()
    const onActiveDayChange = vi.fn()
    const onStopPlaceSelect = vi.fn()
    const withStop = { ...trip, days: [{ ...trip.days[0], stops: [{ id: 'stop-focus', trip_day_id: 'day-1', place_id: 'place-focus', stop_type: 'place', name: 'Belvédère', latitude: 42.4, longitude: 3.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' }] }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStop]); vi.mocked(getTrip).mockResolvedValue(withStop)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStop} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={onActiveDayChange} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Belvédère/ }))
    expect(onStopFocus).toHaveBeenCalledWith(42.4, 3.1)
    expect(onActiveDayChange).toHaveBeenCalledWith('day-1')
    expect(onStopPlaceSelect).toHaveBeenCalledWith('place-focus')
    expect(screen.queryByRole('combobox', { name: /Visite/ })).not.toBeInTheDocument()
  })

  it('shows a precise insertion bar and moves the dragged stop to that position', async () => {
    const stops = [0, 1].map((index) => ({ id: `stop-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const withStops = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withStops]); vi.mocked(getTrip).mockResolvedValue(withStops)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withStops} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const source = screen.getByRole('button', { name: /Étape 0/ }).closest('li')!
    const target = screen.getByRole('button', { name: /Étape 1/ }).closest('li')!
    expect(screen.queryByRole('button', { name: 'Monter l’étape' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descendre l’étape' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Supprimer l’étape' })).toHaveLength(2)
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

  it('shows action-specific loading indicators for daily route actions', async () => {
    const stops = [0, 1].map((index) => ({ id: `loading-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const routable = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    const routeRequest = deferred<Trip['days'][number]>()
    const optimizationRequest = deferred<Awaited<ReturnType<typeof optimizeTripDay>>>()
    vi.mocked(listTrips).mockResolvedValue([routable])
    vi.mocked(getTrip).mockResolvedValue(routable)
    vi.mocked(calculateTripDayRoute).mockReturnValueOnce(routeRequest.promise)
    vi.mocked(optimizeTripDay).mockReturnValueOnce(optimizationRequest.promise)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={routable} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Itinéraire' }))
    const pendingRoute = screen.getByRole('button', { name: 'Calcul de l’itinéraire en cours' })
    expect(pendingRoute).toBeDisabled()
    expect(pendingRoute.querySelector('.trip-action-spinner')).toBeInTheDocument()
    await act(async () => routeRequest.resolve(routable.days[0]))
    await screen.findByRole('button', { name: 'Itinéraire rafraîchi' })

    fireEvent.click(screen.getByRole('button', { name: 'Optimiser' }))
    const pendingOptimization = screen.getByRole('button', { name: 'Optimisation de la journée en cours' })
    expect(pendingOptimization).toBeDisabled()
    expect(pendingOptimization.querySelector('.trip-action-spinner')).toBeInTheDocument()
    await act(async () => optimizationRequest.resolve({
      manual_stop_ids: ['loading-0', 'loading-1'],
      optimized_stop_ids: ['loading-1', 'loading-0'],
      before: 120,
      after: 100,
      gain: 20,
      metric: 'duration',
      before_distance_meters: 1_000,
      after_distance_meters: 900,
      distance_gain_meters: 100,
      before_duration_seconds: 120,
      after_duration_seconds: 100,
      duration_gain_seconds: 20,
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Optimiser' })).toBeEnabled())
  })

  it('shows action-specific loading indicators for global route actions', async () => {
    const stops = [0, 1].map((index) => ({ id: `global-loading-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const routable = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    const routeRequest = deferred<Trip['days'][number]>()
    const optimizationRequest = deferred<Awaited<ReturnType<typeof optimizeTrip>>>()
    vi.mocked(listTrips).mockResolvedValue([routable])
    vi.mocked(getTrip).mockResolvedValue(routable)
    vi.mocked(calculateTripDayRoute).mockReturnValueOnce(routeRequest.promise)
    vi.mocked(optimizeTrip).mockReturnValueOnce(optimizationRequest.promise)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={routable} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Calculer les itinéraires' }))
    const pendingRoutes = screen.getByRole('button', { name: 'Calcul des itinéraires en cours' })
    expect(pendingRoutes).toBeDisabled()
    expect(pendingRoutes.querySelector('.trip-action-spinner')).toBeInTheDocument()
    await act(async () => routeRequest.resolve(routable.days[0]))
    await screen.findByRole('button', { name: 'Itinéraires rafraîchis' })

    fireEvent.click(screen.getByRole('button', { name: 'Optimiser le voyage' }))
    const pendingOptimization = screen.getByRole('button', { name: 'Optimisation du voyage en cours' })
    expect(pendingOptimization).toBeDisabled()
    expect(pendingOptimization.querySelector('.trip-action-spinner')).toBeInTheDocument()
    await act(async () => optimizationRequest.resolve({ proposal_id: 'global-loading-proposal', trip_id: trip.id, days: [{
      proposal_id: 'global-loading-proposal', day_id: 'day-1', day_number: 1,
      manual_stop_ids: ['global-loading-0', 'global-loading-1'],
      optimized_stop_ids: ['global-loading-1', 'global-loading-0'],
      before: 120, after: 100, gain: 20, metric: 'duration',
      before_distance_meters: 1_000, after_distance_meters: 900, distance_gain_meters: 100,
      before_duration_seconds: 120, after_duration_seconds: 100, duration_gain_seconds: 20,
    }] }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Optimiser le voyage' })).toBeDisabled())
    expect(screen.getByRole('heading', { name: 'Résultat pour 1 journée' })).toBeVisible()
  })

  it('separates daily and global route metrics from visits', async () => {
    const routed = { ...trip, days: [{ ...trip.days[0], route_status: 'ready', route_distance_meters: 184_300, route_duration_seconds: 13_320, visit_duration_minutes: 330, stops: [{ id: 'visit-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: 'Visite', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 330, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([routed]); vi.mocked(getTrip).mockResolvedValue(routed)
    vi.mocked(getTripSummary).mockResolvedValue({ ...emptySummary, stops: 1, distance_meters: 184_300, route_duration_seconds: 13_320, visit_duration_minutes: 330, total_duration_minutes: 552, visit_status_counts: { planned: 1 }, total_route_distance_meters: 184_300, total_route_distance_km: 184.3, total_route_duration_seconds: 13_320, total_route_duration_minutes: 222, total_visit_duration_minutes: 330, total_estimated_duration_minutes: 552, total_planned_duration_minutes: 552, days_with_route: 1, days_without_route: 0, is_route_summary_complete: true, medium_load_days: 1, days_with_complete_time_summary: 1, days_with_incomplete_time_summary: 0, is_time_summary_complete: true })
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, stops: 1, required_stops: 1, distance_meters: 184_300, route_distance_meters: 184_300, route_distance_km: 184.3, route_duration_seconds: 13_320, route_duration_minutes: 222, visit_duration_minutes: 330, safety_margin_minutes: 0, total_duration_minutes: 552, route_status: 'ready', has_current_route: true, load_level: 'medium', load_color: '#D97706', is_time_summary_complete: true })

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={routed} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('Afficher plus d’infos'))
    expect(await screen.findByLabelText('Distance totale de route : 184,3 km')).toBeVisible()
    expect(screen.getByLabelText('Temps total de conduite : 3 h 42')).toBeVisible()
    expect(screen.getAllByLabelText('Visites : 5 h 30')).toHaveLength(1)
    expect(screen.getByLabelText('Durée totale estimée : 9 h 12')).toBeVisible()
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('184,3 km')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('3 h 42')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('9 h 12')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('Modérée')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('Distance')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('Route')
    expect(screen.getByLabelText('Résumé de la journée')).toHaveTextContent('Total')
    expect(screen.getByLabelText('Résumé de la journée').querySelector('.trip-timeline-status')).toBeInTheDocument()
    expect(screen.getByLabelText('Chiffres clés du voyage').querySelector('.lucide-road')).toBeInTheDocument()
    expect(screen.getByLabelText('Résumé de la journée').querySelector('.lucide-road')).toBeInTheDocument()
    expect(screen.getByLabelText('Résumé de la journée').querySelector('.lucide-gauge')).toBeInTheDocument()
    expect(screen.getByLabelText('Résumé de la journée').closest('summary')?.querySelector('.trip-panel-day-actions .lucide-eye')).not.toBeInTheDocument()
    expect(screen.getByText('Valide').closest('.trip-panel-day')).not.toBeNull()
    expect(screen.queryByText('Bilan de la journée')).not.toBeInTheDocument()
  })

  it('groups day planning and color settings and shows the recommended time on the preceding anchor', async () => {
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, recommended_start_time: '08:25:00', recommended_start_day_offset: 0 })
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const recommendedDeparture = await screen.findByLabelText('Départ recommandé : 08:25')
    expect(recommendedDeparture).toBeVisible()
    expect(recommendedDeparture).toHaveTextContent('Départ conseillé')
    expect(container.querySelector('.trip-panel-day-number .lucide-sun')).toBeInTheDocument()
    expect(screen.queryByText('Bilan de la journée')).not.toBeInTheDocument()
    const settingsButton = screen.getByRole('button', { name: 'Réglages' })
    expect(settingsButton.querySelector('.lucide-settings-2')).toBeInTheDocument()
    expect(settingsButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(settingsButton)
    expect(settingsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Planification horaire')).toBeVisible()
    expect(screen.getByText('Couleur du jour')).toBeVisible()
    fireEvent.click(settingsButton)
    expect(screen.queryByText('Planification horaire')).not.toBeInTheDocument()
  })

  it('keeps a day color as a draft until it is explicitly applied', async () => {
    vi.mocked(updateTripDay).mockResolvedValue({ ...trip.days[0], color: '#2563EB' } as never)
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    const settingsButton = await screen.findByRole('button', { name: 'Réglages' })
    fireEvent.click(settingsButton)
    const picker = screen.getByLabelText('Couleur du jour 1')
    fireEvent.change(picker, { target: { value: '#2563eb' } })

    expect(updateTripDay).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Appliquer la couleur' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la couleur' }))
    await waitFor(() => expect(updateTripDay).toHaveBeenCalledWith('day-1', { color: '#2563EB' }))
  })

  it('marks stale routes as unavailable and the global summary as partial', async () => {
    const staleTrip = { ...trip, days: [{ ...trip.days[0], route_status: 'stale', route_distance_meters: 184_300, route_duration_seconds: 13_320 }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([staleTrip]); vi.mocked(getTrip).mockResolvedValue(staleTrip)
    vi.mocked(getTripDaySummary).mockResolvedValue({ ...emptyDaySummary, route_status: 'stale', route_is_stale: true })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={staleTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Itinéraire à recalculer')).toBeVisible()
    fireEvent.click(screen.getByText('Afficher plus d’infos'))
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

  it('reviews the global optimization with a positive apply action before changing days', async () => {
    const stops = [0, 1].map((index) => ({ id: `global-${index}`, trip_day_id: 'day-1', place_id: null, stop_type: 'free_location' as const, name: `Étape ${index}`, latitude: 48 + index, longitude: 2 + index, address: null, sort_order: index, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }))
    const optimizable = { ...trip, days: [{ ...trip.days[0], stops }] } satisfies Trip
    const proposal = { proposal_id: 'proposal-1', day_id: 'day-1', day_number: 1, manual_stop_ids: ['global-0', 'global-1'], optimized_stop_ids: ['global-1', 'global-0'], before: 17_520, after: 14_880, gain: 2_640, metric: 'duration' as const, before_distance_meters: 214_000, after_distance_meters: 176_000, distance_gain_meters: 38_000, before_duration_seconds: 17_520, after_duration_seconds: 14_880, duration_gain_seconds: 2_640 }
    vi.mocked(listTrips).mockResolvedValue([optimizable]); vi.mocked(getTrip).mockResolvedValue(optimizable)
    vi.mocked(optimizeTrip).mockResolvedValue({ proposal_id: 'proposal-1', trip_id: trip.id, days: [proposal] })
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={optimizable} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Optimiser le voyage' }))

    expect(await screen.findByRole('heading', { name: 'Résultat pour 1 journée' })).toBeVisible()
    expect(screen.getByText('Gain total : 38 km · 44 min')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Appliquer l’optimisation' })).toHaveClass('primary')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(confirmTripOptimizations).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer l’optimisation' }))
    await waitFor(() => expect(confirmTripOptimizations).toHaveBeenCalledWith(trip.id, 'proposal-1'))
  })

  it('replaces departure and arrival with POIs dropped from the places panel', async () => {
    const anchoredTrip = {
      ...trip,
      departure: { id: 'departure-1', trip_id: trip.id, place_id: null, name: 'Ancien départ', latitude: 48, longitude: 2, address: null, notes: 'départ', departure_time: '08:00:00' },
      arrival: { id: 'arrival-1', trip_id: trip.id, place_id: null, name: 'Ancienne arrivée', latitude: 49, longitude: 3, address: null, notes: 'arrivée' },
    } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([anchoredTrip])
    vi.mocked(getTrip).mockResolvedValue(anchoredTrip)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={anchoredTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    const dataTransfer = { getData: (type: string) => type === 'application/x-cartavault-place' ? 'place-new' : '', types: ['application/x-cartavault-place'], dropEffect: 'none' }

    fireEvent.drop(container.querySelector('.trip-panel-departure')!, { dataTransfer })
    await waitFor(() => expect(updateTripDeparture).toHaveBeenCalledWith('departure-1', {
      place_id: 'place-new', notes: 'départ', departure_time: '08:00:00',
    }))

    fireEvent.drop(container.querySelector('.trip-panel-arrival')!, { dataTransfer })
    await waitFor(() => expect(updateTripArrival).toHaveBeenCalledWith('arrival-1', {
      place_id: 'place-new', notes: 'arrivée',
    }))
  })

  it('delegates anchor drops to the shared replacement workflow when provided', async () => {
    const onAnchorPlaceDrop = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onAnchorPlaceDrop={onAnchorPlaceDrop} onClose={vi.fn()} />)
    const dataTransfer = { getData: () => 'place:place-new', types: ['text/plain'], dropEffect: 'none' }

    fireEvent.drop(container.querySelector('.trip-panel-departure')!, { dataTransfer })
    fireEvent.drop(container.querySelector('.trip-panel-arrival')!, { dataTransfer })

    expect(onAnchorPlaceDrop).toHaveBeenNthCalledWith(1, 'departure', 'place-new')
    expect(onAnchorPlaceDrop).toHaveBeenNthCalledWith(2, 'arrival', 'place-new')
  })

  it('opens a classic POI popup callback for linked trip anchors', async () => {
    const linkedTrip = {
      ...trip,
      departure: { id: 'departure-1', trip_id: trip.id, place_id: 'place-1', name: 'Gare', latitude: 48, longitude: 2, address: null, notes: null, departure_time: null },
    } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([linkedTrip])
    vi.mocked(getTrip).mockResolvedValue(linkedTrip)
    const onStopPlaceSelect = vi.fn()
    const onAnchorPopupChange = vi.fn()
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={linkedTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onStopPlaceSelect={onStopPlaceSelect} onAnchorPopupChange={onAnchorPopupChange} onClose={vi.fn()} />)

    fireEvent.click(await within(container.querySelector('.trip-panel-departure') as HTMLElement).findByRole('button', { name: 'POI' }))

    expect(onStopPlaceSelect).toHaveBeenCalledWith('place-1')
    expect(onAnchorPopupChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Supprimer le point de départ' })).toBeVisible()
  })

  it('selects trip anchors for map search without legacy edit actions', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const anchoredTrip = {
      ...trip,
      days: [trip.days[0], secondDay],
      departure: { id: 'departure-1', trip_id: trip.id, place_id: null, name: 'Maison', latitude: 48, longitude: 2, address: null, notes: null, departure_time: '08:00:00' },
      arrival: { id: 'arrival-1', trip_id: trip.id, place_id: null, name: 'Retour maison', latitude: 48, longitude: 2, address: null, notes: null },
      nights: [{ id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map', name: 'Hôtel', latitude: 49, longitude: 3, address: '1 rue de Paris', google_place_id: 'ChIJ-hotel-official', notes: null, check_in_time: '20:00:00', check_out_time: '08:00:00' }],
    } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([anchoredTrip])
    vi.mocked(getTrip).mockResolvedValue(anchoredTrip)
    vi.mocked(getTripDaySummary).mockImplementation(async (id) => ({
      ...emptyDaySummary,
      day_id: id,
      recommended_start_time: id === 'day-2' ? '08:25' : '07:10',
      estimated_arrival_time: id === 'day-2' ? '18:40' : null,
    }))
    const onActiveAnchorTargetChange = vi.fn()
    const onAnchorPopupChange = vi.fn()

    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={anchoredTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onActiveAnchorTargetChange={onActiveAnchorTargetChange} onAnchorPopupChange={onAnchorPopupChange} onClose={vi.fn()} />)

    const departureCard = container.querySelector<HTMLElement>('.trip-panel-departure')!
    const arrivalCard = container.querySelector<HTMLElement>('.trip-panel-arrival')!
    fireEvent.click(await within(departureCard).findByRole('button', { name: 'Point cartographique' }))
    expect(onActiveAnchorTargetChange).toHaveBeenLastCalledWith('departure')
    expect(onAnchorPopupChange).toHaveBeenLastCalledWith('departure')
    fireEvent.click(within(arrivalCard).getByRole('button', { name: 'Point cartographique' }))
    expect(onActiveAnchorTargetChange).toHaveBeenLastCalledWith('arrival')
    expect(onAnchorPopupChange).toHaveBeenLastCalledWith('arrival')
    expect(screen.queryByRole('button', { name: 'Modifier le point de départ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier le point d’arrivée' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer le lieu de la nuit' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Modifier le lieu de la nuit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ouvrir la fiche Google Maps de Hôtel' })).not.toBeInTheDocument()
    const departureGoogleLink = screen.getByRole('link', { name: 'Ouvrir Maison dans Google Maps' })
    const arrivalGoogleLink = screen.getByRole('link', { name: 'Ouvrir Retour maison dans Google Maps' })
    expect(departureGoogleLink).toHaveAttribute('href', expect.stringContaining('query=48%2C2'))
    expect(arrivalGoogleLink).toHaveAttribute('href', expect.stringContaining('query=48%2C2'))
    expect(screen.getByRole('button', { name: 'Supprimer le point de départ' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Supprimer le point d’arrivée' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Utiliser le point de départ comme arrivée' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer l’hébergement' })).not.toBeInTheDocument()
    expect(container.querySelector('.trip-night-metrics')).not.toBeInTheDocument()
    expect(container.querySelector('.trip-night-kind')).not.toBeInTheDocument()
    expect(container.querySelector('.trip-night-stop')).toHaveAttribute('aria-label', 'Point cartographique')
    const departureHeader = container.querySelector('.trip-panel-departure .trip-night-header-row') as HTMLElement
    const departureMetrics = departureHeader.querySelector('.trip-anchor-header-metrics')
    expect(departureMetrics?.children[0]).toBe(within(departureHeader).getByLabelText('Départ recommandé : 07:10'))
    expect(departureMetrics?.children[3]).toContainElement(within(departureHeader).getByText('Valide').closest('.trip-timeline-status'))
    const nightHeader = (await screen.findByText('Nuit 1')).closest('.trip-night-header-row') as HTMLElement
    const nightMetrics = nightHeader.querySelector('.trip-night-header-metrics')
    const recommendedDeparture = within(nightHeader).getByLabelText('Départ recommandé : 08:25')
    expect(recommendedDeparture).toHaveClass('trip-day-header-metric', 'trip-night-recommended')
    expect(nightMetrics?.children[0]).toBe(recommendedDeparture)
    expect(nightMetrics?.children[3]).toContainElement(within(nightHeader).getByText('Valide').closest('.trip-timeline-status'))
    const arrivalHeader = container.querySelector('.trip-panel-arrival .trip-night-header-row') as HTMLElement
    const arrivalMetrics = arrivalHeader.querySelector('.trip-anchor-header-metrics')
    expect(arrivalMetrics?.children[0]).toBe(within(arrivalHeader).getByLabelText('Arrivée estimée : 18:40'))
    expect(arrivalMetrics?.children[3]).toContainElement(within(arrivalHeader).getByText('Valide').closest('.trip-timeline-status'))

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le point d’arrivée' }))
    await waitFor(() => expect(deleteTripArrival).toHaveBeenCalledWith('arrival-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le point de départ' }))
    await waitFor(() => expect(deleteTripDeparture).toHaveBeenCalledWith('departure-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Réduire le départ' }))
    expect(screen.queryByText('Maison')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Développer le départ' }))
    expect(screen.getByText('Maison')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Réduire l’arrivée' }))
    expect(screen.queryByText('Retour maison')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Développer l’arrivée' }))
    expect(screen.getByText('Retour maison')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Tout replier' }))
    expect(screen.queryByText('Maison')).not.toBeInTheDocument()
    expect(screen.queryByText('Hôtel')).not.toBeInTheDocument()
    expect(screen.queryByText('Retour maison')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tout déplier' }))
    expect(screen.getByText('Maison')).toBeVisible()
    expect(screen.getByText('Hôtel')).toBeVisible()
    expect(screen.getByText('Retour maison')).toBeVisible()
  })

  it('directs an empty night to the map search without opening a dialog', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const tripWithoutNight = { ...trip, days: [trip.days[0], secondDay], nights: [] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([tripWithoutNight])
    vi.mocked(getTrip).mockResolvedValue(tripWithoutNight)

    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={tripWithoutNight} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect((await screen.findAllByText('Glissez un POI ou utilisez la recherche de la carte')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Ajouter un hébergement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects a night as the active itinerary target without opening its editor', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const withNight = { ...trip, days: [trip.days[0], secondDay], nights: [{ id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'place-hotel', source_type: 'place' as const, name: 'Hôtel central', latitude: 49, longitude: 3, address: null, google_place_id: null, notes: null, check_in_time: null, check_out_time: null }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withNight])
    vi.mocked(getTrip).mockResolvedValue(withNight)
    const onActiveDayChange = vi.fn()
    const onActiveNightTargetChange = vi.fn()
    const onStopFocus = vi.fn()
    const onStopPlaceSelect = vi.fn()
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withNight} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={onActiveDayChange} onActiveNightTargetChange={onActiveNightTargetChange} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} onClose={vi.fn()} />)

    fireEvent.click((await screen.findByText('Nuit 1')).closest('.trip-night-header-row') as HTMLElement)
    expect(onActiveNightTargetChange).toHaveBeenLastCalledWith(expect.objectContaining({ nightId: 'night-1' }), false)
    expect(onStopFocus).not.toHaveBeenCalled()
    const night = await screen.findByText('Hôtel central')
    fireEvent.click(night)

    expect(onActiveNightTargetChange).toHaveBeenLastCalledWith(expect.objectContaining({ nightId: 'night-1' }), true)
    expect(container.querySelector('.trip-panel-night.is-active')).toBeInTheDocument()
    expect(onActiveDayChange).toHaveBeenCalledWith('day-2')
    expect(onStopFocus).toHaveBeenCalledWith(49, 3)
    expect(onStopPlaceSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('centers the map on a free night address without opening a POI', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const withNight = { ...trip, days: [trip.days[0], secondDay], nights: [{ id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map' as const, name: 'Adresse de nuit', latitude: 48.8566, longitude: 2.3522, address: 'Paris', google_place_id: null, notes: null, check_in_time: null, check_out_time: null }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withNight])
    vi.mocked(getTrip).mockResolvedValue(withNight)
    const onStopFocus = vi.fn()
    const onStopPlaceSelect = vi.fn()
    render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withNight} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} onClose={vi.fn()} />)

    fireEvent.click(await screen.findByText('Adresse de nuit'))

    expect(onStopFocus).toHaveBeenCalledWith(48.8566, 2.3522)
    expect(onStopPlaceSelect).not.toHaveBeenCalled()
  })

  it('renders an overnight POI as a compact stop row with only a remove action', async () => {
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const withNight = { ...trip, days: [trip.days[0], secondDay], nights: [{ id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'place-hotel', source_type: 'place' as const, name: 'Hôtel central', latitude: 49, longitude: 3, address: null, google_place_id: null, notes: null, check_in_time: null, check_out_time: null }] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([withNight])
    vi.mocked(getTrip).mockResolvedValue(withNight)
    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={withNight} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Hôtel central')).toBeVisible()
    const nightStop = container.querySelector('.trip-night-stop')
    expect(nightStop).toBeInTheDocument()
    expect(nightStop).toHaveAccessibleName('POI')
    expect(within(nightStop as HTMLElement).getByRole('button', { name: 'Retirer le lieu de la nuit' })).toBeVisible()
    expect(container.querySelector('.trip-panel-night .trip-anchor-actions')).not.toBeInTheDocument()

    fireEvent.click(within(nightStop as HTMLElement).getByRole('button', { name: 'Retirer le lieu de la nuit' }))
    await waitFor(() => expect(deleteTripNight).toHaveBeenCalledWith('night-1'))
  })

  it('does not render the legacy free-location insertion row', () => {
    render(<TripPlannerPanel poiMap={{ id: 'map-1', name: 'Belgique', country: { iso_alpha2: 'BE' }, effective_center_latitude: 50.5, effective_center_longitude: 4.5, can_edit: true } as never} trip={trip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Lieu libre/ })).not.toBeInTheDocument()
    expect(document.querySelector('.trip-panel-free-stop')).not.toBeInTheDocument()
  })

  it('opens mobile stops and keeps swipe action menus interactive for days and nights', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const firstDay = { ...trip.days[0], stops: [{ id: 'stop-1', trip_day_id: 'day-1', place_id: 'place-1', stop_type: 'place' as const, name: 'Musée', latitude: 48.1, longitude: 2.1, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' as const }] }
    const secondDay = { ...trip.days[0], id: 'day-2', day_number: 2, sort_order: 1 }
    const night = { id: 'night-1', trip_id: trip.id, previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map' as const, name: 'Hôtel central', latitude: 48.5, longitude: 2.5, address: 'Paris', google_place_id: null, notes: null, check_in_time: null, check_out_time: null }
    const mobileTrip = { ...trip, days: [firstDay, secondDay], nights: [night] } satisfies Trip
    vi.mocked(listTrips).mockResolvedValue([mobileTrip])
    vi.mocked(getTrip).mockResolvedValue(mobileTrip)
    const onPreviewStopSelect = vi.fn()

    const { container } = render(<TripPlannerPanel poiMap={{ id: 'map-1', can_edit: true } as never} trip={mobileTrip} activeDayId="day-1" onTripChange={vi.fn()} onActiveDayChange={vi.fn()} onPreviewStopSelect={onPreviewStopSelect} onClose={vi.fn()} />)

    const stopRow = await screen.findByRole('button', { name: 'Ouvrir Musée' })
    fireEvent.pointerDown(stopRow.closest('li')!, { pointerId: 1, clientX: 220, clientY: 120 })
    fireEvent.pointerUp(stopRow.closest('li')!, { pointerId: 1, clientX: 220, clientY: 120 })
    fireEvent.click(stopRow)
    expect(onPreviewStopSelect).toHaveBeenCalledWith('stop-1')

    const stopItem = stopRow.closest('li')!
    fireEvent.pointerDown(stopItem, { pointerId: 2, clientX: 240, clientY: 120 })
    fireEvent.pointerMove(stopItem, { pointerId: 2, clientX: 100, clientY: 122 })
    fireEvent.pointerUp(stopItem, { pointerId: 2, clientX: 100, clientY: 122 })
    expect(stopItem).toHaveClass('is-more-revealed')
    fireEvent.change(within(stopItem).getByLabelText('Envoyer Musée vers'), { target: { value: 'day:day-2' } })
    await waitFor(() => expect(moveTripStop).toHaveBeenCalledWith('stop-1', 'day-2', 0))

    const nextButton = container.querySelector<HTMLButtonElement>('.trip-mobile-active-day button:last-child')!
    fireEvent.click(nextButton)
    const nightRow = await screen.findByRole('button', { name: 'Ouvrir Hôtel central' })
    fireEvent.pointerDown(nightRow, { pointerId: 3, clientX: 240, clientY: 180 })
    fireEvent.pointerMove(nightRow, { pointerId: 3, clientX: 100, clientY: 182 })
    fireEvent.pointerUp(nightRow, { pointerId: 3, clientX: 100, clientY: 182 })
    expect(nightRow).toHaveStyle({ transform: 'translateX(-132px)' })
    expect(screen.getByRole('link', { name: 'Ouvrir Hôtel central dans Google Maps' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Envoyer Hôtel central vers'), { target: { value: 'day:day-2' } })
    await waitFor(() => expect(addTripStop).toHaveBeenCalledWith('day-2', expect.objectContaining({ name: 'Hôtel central' })))
  })
})
