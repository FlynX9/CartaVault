import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountModal } from './AccountModal'
import { getAccountPreferences, getAccountProfile, getAccountSessions, updateAccountPreferences, updateAccountProfile } from '../../api/account'

vi.mock('../../api/account', () => ({
  accountAvatarUrl: (value: string | null) => value,
  changeAccountEmail: vi.fn(), changeAccountPassword: vi.fn(), deleteAccountAvatar: vi.fn(), deleteOwnAccount: vi.fn(),
  getAccountPreferences: vi.fn(), getAccountProfile: vi.fn(), getAccountSessions: vi.fn(), resetAccountPreferences: vi.fn(),
  revokeAccountSession: vi.fn(), revokeOtherAccountSessions: vi.fn(), updateAccountPreferences: vi.fn(), updateAccountProfile: vi.fn(), uploadAccountAvatar: vi.fn(),
}))
const refresh = vi.fn()
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, avatar_url: null }, refresh }) }))

const profile = { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, is_active: true, avatar_url: null, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, owned_maps: [], shared_map_count: 1, active_session_count: 1, can_delete: true }
const preferences = { preferred_basemap: 'cartavault-light' as const, density: 'comfortable' as const, startup_panel: 'maps' as const, timezone: 'Europe/Paris', routing: { stay_in_country: false } }

beforeEach(() => { vi.mocked(getAccountProfile).mockResolvedValue(profile); vi.mocked(getAccountSessions).mockResolvedValue([]); vi.mocked(getAccountPreferences).mockResolvedValue(preferences); vi.mocked(updateAccountProfile).mockResolvedValue(profile); vi.mocked(updateAccountPreferences).mockResolvedValue({ ...preferences, routing: { stay_in_country: true } }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AccountModal', () => {
  it('renders account sections separately from administration', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeVisible()
    for (const label of ['Profil', 'Avatar', 'Sécurité', 'Sessions', 'Préférences', 'Administration', 'Zone sensible']) expect(screen.getByRole('button', { name: label })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Avatar' }))
    expect(screen.getByRole('heading', { name: 'Avatar' })).toBeVisible()
  })

  it('updates the display name and refreshes AuthProvider', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    const input = await screen.findByLabelText('Nom d’affichage')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith('Nouveau nom'))
    expect(refresh).toHaveBeenCalled()
  })

  it('persists the country-routing preference', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    const checkbox = screen.getByRole('checkbox', { name: 'Rester dans le pays' })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, routing: { stay_in_country: true } }))
  })
})
