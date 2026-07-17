import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Trip, TripDay, TripDayTimeSummary, TripStop } from '../../types/trip'
import { DayTimeSummary, DayTimingSettings, TripLoadSettingsForm, VisitDurationControl } from './TripTimePlanning'

const day = { id: 'day-1', trip_id: 'trip-1', day_number: 1, date: null, title: null, notes: null, planned_start_time: '08:00:00', planned_end_time: null, target_arrival_time: '12:00:00', default_stop_buffer_minutes: 10, safety_margin_type: 'fixed', safety_margin_value: 15, max_total_duration_minutes: null, route_distance_meters: 50_000, route_duration_seconds: 3600, visit_duration_minutes: 120, total_duration_minutes: 215, route_geometry: null, route_segments: [], route_status: 'ready', sort_order: 0, stops: [] } satisfies TripDay
const summary = { day_id: 'day-1', stops: 3, required_stops: 3, optional_stops: 0, distance_meters: 50_000, route_distance_meters: 50_000, route_distance_km: 50, route_duration_seconds: 3600, route_duration_minutes: 60, visit_duration_minutes: 120, pause_duration_minutes: 0, buffer_duration_minutes: 20, safety_margin_minutes: 15, total_duration_minutes: 215, overload_minutes: 0, unroutable_segments: 0, route_status: 'ready', route_is_stale: false, has_current_route: true, planned_start_time: '08:00:00', target_arrival_time: '12:00:00', recommended_start_time: '08:25:00', recommended_start_day_offset: 0, estimated_arrival_time: '11:35:00', estimated_arrival_day_offset: 0, schedule_delta_minutes: -25, schedule_status: 'early', load_level: 'low', load_color: '#0FA68A', is_time_summary_complete: true } satisfies TripDayTimeSummary

describe('TripTimePlanning', () => {
  afterEach(cleanup)
  it('renders every time component without a pause or manually planned start', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<><DayTimeSummary day={day} summary={summary} /><DayTimingSettings day={day} summary={summary} canEdit busy={false} onSave={onSave} /></>)

    fireEvent.click(screen.getByText('Bilan de la journée'))
    expect(screen.getByLabelText('Conduite : 1 h 00')).toBeVisible()
    expect(screen.getByLabelText('Tampon : 20 min')).toBeVisible()
    expect(screen.getByLabelText('Marge : 15 min')).toBeVisible()
    expect(screen.queryByText(/pause/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Départ planifié')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Planification horaire'))
    expect(document.querySelector('.trip-time-settings > summary > strong')).toHaveTextContent('08:25')
  })

  it('offers visit presets and custom values', () => {
    const stop = { id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location', name: 'Musée', latitude: 48, longitude: 2, address: null, sort_order: 0, visit_duration_minutes: 30, notes: null, is_required: true, is_locked: false, visit_status: 'planned' } satisfies TripStop
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<VisitDurationControl stop={stop} disabled={false} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Durée de visite pour Musée' }), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('saves buffer presets, percentage margins and target times', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<DayTimingSettings day={day} summary={summary} canEdit busy={false} onSave={onSave} />)
    fireEvent.click(screen.getByText('Planification horaire'))
    fireEvent.change(screen.getByLabelText('Préréglage du temps tampon'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Type de marge'), { target: { value: 'percentage' } })
    fireEvent.change(screen.getByLabelText('Valeur de la marge'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Heure cible de fin de journée'), { target: { value: '20:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ target_arrival_time: '20:00', default_stop_buffer_minutes: 30, safety_margin_type: 'percentage', safety_margin_value: 10 }))
  })

  it('uses 20:00 as the editable default arrival when the day has no override', () => {
    render(<DayTimingSettings day={{ ...day, target_arrival_time: null }} summary={{ ...summary, target_arrival_time: '20:00:00' }} canEdit busy={false} onSave={vi.fn()} />)
    fireEvent.click(screen.getByText('Planification horaire'))
    expect(screen.getByLabelText('Heure cible de fin de journée')).toHaveValue('20:00')
  })

  it('resets configurable load thresholds and colors', () => {
    const trip = { id: 'trip-1', map_id: 'map-1', created_by_user_id: 'user-1', name: 'Voyage', description: null, start_date: null, end_date: null, status: 'draft', routing_profile: 'driving', low_load_max_minutes: 180, medium_load_max_minutes: 360, low_load_color: '#111111', medium_load_color: '#222222', high_load_color: '#333333', created_at: '', updated_at: '', completed_at: null, archived_at: null, days: [], nights: [], departure: null } satisfies Trip
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TripLoadSettingsForm trip={trip} canEdit busy={false} onSave={onSave} />)
    fireEvent.click(screen.getByText('Charge des journées'))
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))
    expect(onSave).toHaveBeenCalledWith({ low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626' })
  })
})
