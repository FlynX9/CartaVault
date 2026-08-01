import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TripStop } from '../../types/trip'
import { TripStopMapPopup } from './TripStopMapPopup'

const stop: TripStop = { id: 'stop-1', trip_day_id: 'day-1', place_id: null, stop_type: 'free_location', name: 'Belvédère', latitude: 48, longitude: 2, address: '12 route des Crêtes', sort_order: 0, visit_duration_minutes: 30, notes: 'Ne doit pas apparaître', is_required: true, is_locked: false, visit_status: 'planned' }

describe('TripStopMapPopup', () => {
  it('shows only the free stop name and configured address', () => {
    const onClose = vi.fn()
    render(<TripStopMapPopup stop={stop} onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Belvédère' })).toBeVisible()
    expect(screen.getByText('12 route des Crêtes')).toBeVisible()
    expect(screen.queryByText('Ne doit pas apparaître')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fiche de l’étape' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not invent an address when none is configured', () => {
    const { container } = render(<TripStopMapPopup stop={{ ...stop, address: null }} onClose={vi.fn()} />)
    expect(container.querySelector('.trip-stop-map-popup > p')).not.toBeInTheDocument()
  })
})
