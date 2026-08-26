import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TripResizeConfirmationDialog } from './TripResizeConfirmationDialog'

const impact = {
  current_start_date: '2026-08-18',
  current_end_date: '2026-08-24',
  requested_start_date: '2026-08-18',
  requested_end_date: '2026-08-21',
  current_day_count: 7,
  target_day_count: 4,
  removed_day_count: 3,
  removed_stop_count: 8,
  removed_linked_place_stop_count: 6,
  removed_night_count: 1,
  removed_night_photo_count: 4,
  removed_route_count: 2,
  invalidated_retained_route_count: 1,
  removed_days: [{ id: 'day-5', day_number: 5, date: '2026-08-22', title: 'Fin de parcours', stop_count: 3, route_count: 1 }],
}

const labels = {
  title: 'Réduire la sortie', day: 'Jour', message: 'Cette réduction supprimera les données suivantes :', stale: 'La sortie a changé.',
  requestedEndDate: 'Nouvelle date de fin : {{date}}',
  days: ['{{count}} jour supprimé', '{{count}} jours supprimés'] as [string, string],
  stops: ['{{count}} étape supprimée', '{{count}} étapes supprimées'] as [string, string],
  nights: ['{{count}} nuit supprimée', '{{count}} nuits supprimées'] as [string, string],
  photos: ['{{count}} photo supprimée', '{{count}} photos supprimées'] as [string, string],
  routes: ['{{count}} itinéraire supprimé ou invalidé', '{{count}} itinéraires supprimés ou invalidés'] as [string, string],
  cancel: 'Annuler', confirm: 'Réduire et supprimer ces données', close: 'Fermer',
}

describe('TripResizeConfirmationDialog', () => {
  it('shows the server impact and focuses cancel before destructive confirmation', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<TripResizeConfirmationDialog impact={impact} labels={labels} onCancel={onCancel} onConfirm={onConfirm} />)

    expect(screen.getByRole('alertdialog')).toBeVisible()
    expect(screen.getByText('8 étapes supprimées')).toBeVisible()
    expect(screen.getByText('Nouvelle date de fin : 2026-08-21')).toBeVisible()
    expect(screen.getByText('Jour 5 - 2026-08-22 - Fin de parcours')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Réduire et supprimer ces données' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('uses singular labels for a single removed item', () => {
    render(<TripResizeConfirmationDialog impact={{ ...impact, removed_day_count: 1, removed_stop_count: 1, removed_night_count: 1, removed_night_photo_count: 1, removed_route_count: 1, invalidated_retained_route_count: 0 }} labels={labels} onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(screen.getByText('1 jour supprimé')).toBeVisible()
    expect(screen.getByText('1 itinéraire supprimé ou invalidé')).toBeVisible()
  })
})
