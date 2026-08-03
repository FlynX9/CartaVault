import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TripAnchorMapPopup } from './TripAnchorMapPopup'

describe('TripAnchorMapPopup', () => {
  it('shows a simplified geographic anchor card with its external and delete actions', () => {
    const onDelete = vi.fn()
    render(<TripAnchorMapPopup
      anchor={{ id: 'departure-1', trip_id: 'trip-1', place_id: null, name: 'Place de la gare', latitude: 48.1, longitude: 2.3, address: '1 rue de la Gare', notes: 'Rendez-vous ici', departure_time: '08:00:00' }}
      kind="departure"
      canEdit
      onDelete={onDelete}
      onClose={vi.fn()}
    />)

    expect(screen.getByRole('heading', { name: 'Place de la gare' })).toBeVisible()
    expect(screen.getByText('1 rue de la Gare')).toBeVisible()
    expect(screen.getByText('Rendez-vous ici')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute('href', expect.stringContaining('query=48.1%2C2.3'))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
