import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountModal } from './AccountModal'
import { getAccountProfile, getAccountSessions, updateAccountProfile } from '../../api/account'

vi.mock('../../api/account', () => ({ accountAvatarUrl: (value: string | null) => value, changeAccountEmail: vi.fn(), changeAccountPassword: vi.fn(), deleteAccountAvatar: vi.fn(), deleteOwnAccount: vi.fn(), getAccountProfile: vi.fn(), getAccountSessions: vi.fn(), revokeAccountSession: vi.fn(), revokeOtherAccountSessions: vi.fn(), updateAccountProfile: vi.fn(), uploadAccountAvatar: vi.fn() }))
const refresh = vi.fn()
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, avatar_url: null }, refresh }) }))
const profile = { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, is_active: true, avatar_url: null, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, owned_maps: [], shared_map_count: 1, active_session_count: 1, can_delete: true }
beforeEach(() => { vi.mocked(getAccountProfile).mockResolvedValue(profile); vi.mocked(getAccountSessions).mockResolvedValue([]); vi.mocked(updateAccountProfile).mockResolvedValue(profile) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AccountModal', () => {
  it('renders the complete personal account navigation separately from administration', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    expect(await screen.findByRole('heading', { name: 'Mon profil' })).toBeVisible()
    for (const label of ['Mon profil', 'Sécurité', 'Sessions actives', 'Préférences', 'Administration', 'Zone sensible']) expect(screen.getByRole('button', { name: label })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sécurité' }))
    expect(screen.getByRole('heading', { name: 'Sécurité' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Préférences' }))
    expect(screen.getByRole('heading', { name: 'Préférences' })).toBeVisible()
  })

  it('updates the display name and refreshes AuthProvider', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    const input = await screen.findByLabelText('Nom d’affichage')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith('Nouveau nom'))
    expect(refresh).toHaveBeenCalled()
  })
})
