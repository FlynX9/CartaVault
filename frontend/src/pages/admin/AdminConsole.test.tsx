import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { AdminConsole } from './AdminConsole'
import { getAdminCredentials, getAdminUsers, updateAdminUser } from '../../api/adminConsole'

vi.mock('../../api/adminConsole', () => ({
  deleteResendCredential: vi.fn(), getAdminCredentials: vi.fn(), getAdminQuotas: vi.fn(), getAdminUsers: vi.fn(), getInstanceHealth: vi.fn(),
  saveAdminQuotas: vi.fn(), saveResendCredential: vi.fn(), saveUserQuota: vi.fn(), updateAdminUser: vi.fn(), verifyResendCredential: vi.fn(),
}))
vi.mock('../../api/registration', () => ({ getRegistrationRequests: vi.fn().mockResolvedValue([]), reviewRegistration: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { display_name: 'Admin CartaVault' } }) }))

beforeEach(() => {
  vi.mocked(getAdminUsers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25, pages: 1 })
  vi.mocked(getAdminCredentials).mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AdminConsole', () => {
  it('renders its reusable navigation and empty users state', async () => {
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Sections d’administration' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveClass('active')
    expect(await screen.findByText('Aucun utilisateur trouvé.')).toBeVisible()
  })

  it('navigates to credentials without reloading the application', async () => {
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Clés API' })).toBeVisible()
    await waitFor(() => expect(getAdminCredentials).toHaveBeenCalled())
  })

  it('does not expose an expected request cancellation as a panel error', async () => {
    vi.mocked(getAdminCredentials)
      .mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('signal is aborted without reason')))
      }))
      .mockResolvedValueOnce([])

    render(<StrictMode><MemoryRouter initialEntries={['/admin/credentials']}><AdminConsole /></MemoryRouter></StrictMode>)

    await waitFor(() => expect(getAdminCredentials).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('signal is aborted without reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes from the CartaVault dialog with Escape', async () => {
    const onClose = vi.fn()
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole onClose={onClose} /></MemoryRouter>)
    expect(await screen.findByRole('dialog', { name: 'Administration' })).toBeVisible()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows user promotion confirmation above the administration dialog', async () => {
    const target = {
      id: '11111111-1111-4111-8111-111111111111', email: 'user@example.test', display_name: 'Utilisateur',
      role: 'user' as const, state: 'active' as const, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
      last_login_at: null, owned_map_count: 0, shared_map_count: 0,
    }
    vi.mocked(getAdminUsers).mockResolvedValue({ items: [target], total: 1, page: 1, page_size: 25, pages: 1 })

    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Promouvoir' }))

    expect(screen.getByRole('alertdialog', { name: 'Modifier le rôle' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith(target.id, { role: 'admin' }))
  })
})
