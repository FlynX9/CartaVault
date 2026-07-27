import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getTrash, permanentlyDeleteTrashItem, restoreTrashItem } from '../../api/trash'
import { TrashWorkspacePanel } from './TrashWorkspacePanel'

vi.mock('../../api/trash', () => ({
  getTrash: vi.fn(),
  permanentlyDeleteTrashItem: vi.fn(),
  restoreTrashItem: vi.fn(),
}))

const items = [
  {
    id: 'map-1',
    item_type: 'map' as const,
    name: 'Georgia',
    map_id: 'map-1',
    map_name: 'Georgia',
    deleted_at: '2026-07-01T10:00:00Z',
    purge_after: '2026-07-31T10:00:00Z',
    days_remaining: 4,
    can_restore: true,
    can_delete_permanently: true,
  },
  {
    id: 'place-1',
    item_type: 'place' as const,
    name: 'Old church',
    map_id: 'map-2',
    map_name: 'France',
    deleted_at: '2026-07-02T10:00:00Z',
    purge_after: '2026-08-01T10:00:00Z',
    days_remaining: 5,
    can_restore: true,
    can_delete_permanently: true,
  },
]

describe('TrashWorkspacePanel', () => {
  beforeEach(() => {
    vi.mocked(getTrash).mockResolvedValue(items)
    vi.mocked(restoreTrashItem).mockResolvedValue()
    vi.mocked(permanentlyDeleteTrashItem).mockResolvedValue()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads all deleted item types and filters them without another request', async () => {
    render(<TrashWorkspacePanel />)
    expect(await screen.findByText('Georgia')).toBeVisible()
    expect(screen.getByText('Old church')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Lieux' }))
    expect(screen.queryByText('Georgia')).not.toBeInTheDocument()
    expect(screen.getByText('Old church')).toBeVisible()
    expect(getTrash).toHaveBeenCalledTimes(1)
  })

  it('restores an item and refreshes the workspace', async () => {
    const onChanged = vi.fn()
    render(<TrashWorkspacePanel onChanged={onChanged} />)
    await screen.findByText('Old church')

    fireEvent.click(screen.getByRole('button', { name: 'Restaurer Old church' }))
    await waitFor(() => expect(restoreTrashItem).toHaveBeenCalledWith('place', 'place-1'))
    expect(screen.queryByText('Old church')).not.toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('requires confirmation before permanent deletion', async () => {
    render(<TrashWorkspacePanel />)
    await screen.findByText('Georgia')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement Georgia' }))
    expect(await screen.findByRole('heading', { name: /Supprimer définitivement/ })).toBeVisible()
    expect(permanentlyDeleteTrashItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(permanentlyDeleteTrashItem).toHaveBeenCalledWith('map', 'map-1'))
  })
})
