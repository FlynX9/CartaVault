import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createStatus, deleteStatus, getStatuses, updateStatus } from '../../api/statuses'
import { StatusesPage } from './StatusesPage'

vi.mock('../../api/statuses', () => ({
  getStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
}))

const STATUS = {
  id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB',
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
    render(<StatusesPage />)
    expect(await screen.findByText('À faire')).toBeVisible()
    expect(screen.getByText(/2 POI/)).toHaveTextContent('par défaut')
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  })

  it('creates a status with synchronized hex color fields', async () => {
    render(<StatusesPage />)
    await screen.findByText('À faire')
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'À revoir' } })
    fireEvent.change(screen.getByLabelText('Couleur hexadécimale'), { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('Ordre'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createStatus).toHaveBeenCalledWith(expect.objectContaining({ name: 'À revoir', color: '#ABCDEF', sort_order: 25 })))
  })
})
