import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import { NotificationCenter } from './NotificationCenter'

vi.mock('../../api/maps', () => ({ acceptPendingMapInvitation: vi.fn(), declinePendingMapInvitation: vi.fn(), getPendingMapInvitations: vi.fn() }))

const INVITATION = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', map_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', map_name: 'Carte partagée', role: 'editor' as const, invited_by_display_name: 'Alice Martin', created_at: '2026-07-16T08:00:00', expires_at: '2026-07-23T08:00:00' }

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(getPendingMapInvitations).mockResolvedValue([INVITATION])
  vi.mocked(acceptPendingMapInvitation).mockResolvedValue()
  vi.mocked(declinePendingMapInvitation).mockResolvedValue()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

describe('NotificationCenter', () => {
  it('shows a transient toast and keeps the invitation in the center', async () => {
    vi.useFakeTimers()
    render(<NotificationCenter userId="user-1" onAccessChanged={vi.fn()} />)
    await act(async () => Promise.resolve())
    expect(screen.getByRole('status')).toHaveTextContent('Alice Martin')
    expect(screen.getByRole('button', { name: 'Notifications, 1 non lue' })).toBeVisible()
    act(() => vi.advanceTimersByTime(7_000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 non lue' }))
    expect(screen.getByLabelText('Centre de notifications')).toHaveTextContent('Carte partagée')
    expect(screen.getByRole('button', { name: 'Notifications, 0 non lue' })).toBeVisible()
  })

  it('accepts access from the toast and refreshes maps', async () => {
    const onAccessChanged = vi.fn()
    render(<NotificationCenter userId="user-1" onAccessChanged={onAccessChanged} />)
    const toast = await screen.findByRole('status')
    fireEvent.click(findButton(toast, 'Accepter'))
    await waitFor(() => expect(acceptPendingMapInvitation).toHaveBeenCalledWith(INVITATION.id))
    expect(onAccessChanged).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('refuses access from the notification center', async () => {
    vi.mocked(declinePendingMapInvitation).mockImplementationOnce(async () => {
      vi.mocked(getPendingMapInvitations).mockResolvedValue([])
    })
    render(<NotificationCenter userId="user-1" onAccessChanged={vi.fn()} />)
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 non lue' }))
    const panel = screen.getByLabelText('Centre de notifications')
    fireEvent.click(findButton(panel, 'Refuser'))
    await waitFor(() => expect(declinePendingMapInvitation).toHaveBeenCalledWith(INVITATION.id))
    expect(panel).toHaveTextContent('Aucune notification.')
  })
})

function findButton(element: HTMLElement, label: string): HTMLButtonElement {
  const button = [...element.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
  if (!button) throw new Error(`Button ${label} not found`)
  return button
}
