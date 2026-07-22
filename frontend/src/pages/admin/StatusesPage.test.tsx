import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createStatus, deleteStatus, getStatuses, updateStatus } from '../../api/statuses'
import { StatusesPanel } from './StatusesPage'

vi.mock('../../api/statuses', () => ({
  getStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
}))

const STATUS = {
  id: 'status-id', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', functional_state: 'non_visited' as const,
  sort_order: 10, is_default: true, is_active: true,
  created_at: '2026-07-13T10:00:00', updated_at: '2026-07-13T10:00:00', places_count: 2,
}

beforeEach(() => {
  vi.mocked(getStatuses).mockResolvedValue([STATUS])
  vi.mocked(createStatus).mockResolvedValue({ ...STATUS, id: 'new-id', name: 'À revoir' })
  vi.mocked(updateStatus).mockResolvedValue(STATUS)
  vi.mocked(deleteStatus).mockResolvedValue()
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StatusesPage', () => {
  it('shows color, default state, usage count and protected deletion', async () => {
    render(<StatusesPanel mapId="map-id" />)
    expect(await screen.findByText('À faire')).toBeVisible()
    expect(screen.getByText(/2 POI/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  })

  it('creates a status with the accessible graphical color picker only', async () => {
    render(<StatusesPanel mapId="map-id" />)
    await screen.findByText('À faire')
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'À revoir' } })
    expect(screen.queryByLabelText('Couleur hexadécimale')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('Ordre'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Visité' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createStatus).toHaveBeenCalledWith(expect.objectContaining({ name: 'À revoir', color: '#ABCDEF', sort_order: 25, functional_state: 'visited', map_id: 'map-id' })))
  })

  it('explains the functional state and confirms an impactful change', async () => {
    render(<StatusesPanel mapId="map-id" variant="panel" />)
    await screen.findByText('À faire')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier À faire' }))

    expect(screen.getByText(/regrouper les lieux dans les filtres/)).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'Visité' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText(/modifiera le classement fonctionnel de 2 lieux/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la modification' }))
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('status-id', expect.objectContaining({ functional_state: 'visited' })))
  })
})
