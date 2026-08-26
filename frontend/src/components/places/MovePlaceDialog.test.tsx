import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStatuses } from '../../api/statuses'
import { MovePlaceDialog } from './MovePlaceDialog'

vi.mock('../../api/statuses', () => ({ getStatuses: vi.fn() }))

const maps = [
  { id: 'map-a', name: 'Source', can_edit: true, current_user_role: 'owner' },
  { id: 'map-b', name: 'Destination B', can_edit: true, current_user_role: 'owner' },
  { id: 'map-c', name: 'Destination C', can_edit: true, current_user_role: 'owner' },
] as never

const status = (id: string, name: string) => ({ id, name, map_id: id === 'status-b' ? 'map-b' : 'map-c', slug: name, color: '#123456', is_active: true, is_default: true }) as never

describe('MovePlaceDialog', () => {
  afterEach(() => document.body.replaceChildren())

  it('clears a failed destination attempt before loading statuses for the next map', async () => {
    vi.mocked(getStatuses).mockImplementation(async (mapId) => [mapId === 'map-b' ? status('status-b', 'Statut B') : status('status-c', 'Statut C')])
    render(<MovePlaceDialog maps={maps} sourceMapId="map-a" error="Déplacement bloqué" blockers={{ categories: 1, tags: 0, annotations: 0, trip_stops: 0, trip_nights: 0, trip_anchors: 0 }} onClose={vi.fn()} onMove={vi.fn()} />)

    expect(await screen.findByText('Déplacement bloqué')).toBeVisible()
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('1 catégorie'))).toBe(true)
    fireEvent.change(screen.getByLabelText('Carte de destination'), { target: { value: 'map-c' } })

    expect(screen.queryByText('Déplacement bloqué')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('alert').some((alert) => alert.textContent?.includes('1 catégorie'))).toBe(false)
    await waitFor(() => expect(getStatuses).toHaveBeenLastCalledWith('map-c', expect.any(AbortSignal), { activeOnly: true }))
    expect(await screen.findByRole('option', { name: 'Statut C' })).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Statut B' })).not.toBeInTheDocument()
  })
})
