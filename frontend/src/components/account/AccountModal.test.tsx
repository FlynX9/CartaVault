import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountModal } from './AccountModal'
import { getAccountPreferences, getAccountProfile, getAccountSessions, getPersonalApiKeys, startTotpSetup, updateAccountPreferences, updateAccountProfile } from '../../api/account'

vi.mock('../../api/account', () => ({
  accountAvatarUrl: (value: string | null) => value,
  changeAccountEmail: vi.fn(), changeAccountPassword: vi.fn(), confirmEmailMfaSetup: vi.fn(), confirmTotpSetup: vi.fn(), deleteAccountAvatar: vi.fn(), deleteOwnAccount: vi.fn(), disableEmailMfa: vi.fn(), disableTotp: vi.fn(),
  getAccountPreferences: vi.fn(), getAccountProfile: vi.fn(), getAccountSessions: vi.fn(), getPersonalApiKeys: vi.fn(), resetAccountPreferences: vi.fn(),
  getEmailMfaStatus: vi.fn().mockResolvedValue({ enabled: false, verified_at: null, available: true }), getTotpStatus: vi.fn(), regenerateTotpRecoveryCodes: vi.fn(), startEmailMfaSetup: vi.fn(), startTotpSetup: vi.fn(),
  revokeAccountSession: vi.fn(), revokeOtherAccountSessions: vi.fn(), updateAccountPreferences: vi.fn(), updateAccountProfile: vi.fn(), uploadAccountAvatar: vi.fn(),
  createPersonalApiKey: vi.fn(), updatePersonalApiKey: vi.fn(), verifyPersonalApiKey: vi.fn(), deletePersonalApiKey: vi.fn(),
}))

const refresh = vi.fn()
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, avatar_url: null }, refresh }) }))
vi.mock('../../theme/useTheme', () => ({ useTheme: () => ({ preference: 'light', resolvedTheme: 'light', setPreference: vi.fn(), toggleTheme: vi.fn() }) }))

const profile = { id: 'user', display_name: 'Greg', email: 'greg@example.test', email_verified: true, is_admin: true, is_active: true, avatar_url: null, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, owned_maps: [], shared_map_count: 1, active_session_count: 1, can_delete: true }
const preferences = { language: 'fr' as const, default_theme: 'system' as const, preferred_basemap: 'cartavault-light' as const, density: 'comfortable' as const, startup_panel: 'maps' as const, timezone: 'Europe/Paris', trash_retention_days: 30, photo_markers_enabled: false, onboarding: { dismissed: false, completed_steps: [] as Array<'map' | 'place' | 'import' | 'trip' | 'organization'> }, routing: { provider: 'osrm' as const }, places: { provider: 'stadia' as const } }

beforeEach(async () => {
  const account = await import('../../api/account')
  vi.mocked(account.getTotpStatus).mockResolvedValue({ enabled: false, verified_at: null, recovery_codes_remaining: 0 })
  vi.mocked(getAccountProfile).mockResolvedValue(profile)
  vi.mocked(getAccountSessions).mockResolvedValue([])
  vi.mocked(getAccountPreferences).mockResolvedValue(preferences)
  vi.mocked(getPersonalApiKeys).mockResolvedValue([])
  vi.mocked(startTotpSetup).mockResolvedValue({ secret: 'ABCDEFGHIJKLMNOP', provisioning_uri: 'otpauth://totp/CartaVault:test', qr_code_data_url: 'data:image/png;base64,AAAA', expires_at: '2026-08-13T10:00:00Z', issuer: 'CartaVault', account: 'test@example.test', digits: 6, period: 30 })
  vi.mocked(updateAccountProfile).mockResolvedValue(profile)
  vi.mocked(updateAccountPreferences).mockResolvedValue(preferences)
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AccountModal', () => {
  it('renders the account sections and the unified API key catalog', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeVisible()
    for (const label of ['Profil', 'Sécurité', 'Préférences', 'Clés API']) expect(screen.getByRole('button', { name: label })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Mes clés API' })).toBeVisible()
    await waitFor(() => expect(getPersonalApiKeys).toHaveBeenCalled())
  })

  it('updates the display name and refreshes the session identity', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    const input = await screen.findByLabelText('Nom d’affichage')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith('Nouveau nom'))
    expect(refresh).toHaveBeenCalled()
  })

  it('persists account preferences', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } })
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, language: 'en' }))
  })

  it('persists the circular photo marker preference through the global save action', async () => {
    vi.mocked(updateAccountPreferences).mockImplementation(async (value) => value)
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /Pr.f.rences/ }))

    fireEvent.click(screen.getByRole('switch', { name: /Photos sur les marqueurs/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, photo_markers_enabled: true }))
  })

  it('keeps pending preferences while navigating and warns before closing', async () => {
    const onClose = vi.fn()
    render(<AccountModal onClose={onClose} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    fireEvent.change(screen.getByLabelText('Fuseau horaire'), { target: { value: 'Europe/London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sécurité' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer l’espace compte' }))

    const warning = screen.getByRole('alertdialog', { name: 'Enregistrer les paramètres ?' })
    expect(warning).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(warning).getByRole('button', { name: 'Annuler' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stores the default theme without changing the active session theme', async () => {
    vi.mocked(updateAccountPreferences).mockImplementation(async (value) => value)
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /Pr.f.rences/ }))
    const themeGroup = screen.getByRole('group', { name: /Th.me de l.interface par d.faut/ })

    fireEvent.click(within(themeGroup).getByRole('button', { name: 'Sombre' }))

    expect(updateAccountPreferences).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, default_theme: 'dark' }))
    expect(localStorage.getItem('cartavault.theme:user')).toBe('dark')
  })

  it('edits each API service through a dedicated dialog', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /Pr.f.rences/ }))
    const editButtons = await screen.findAllByRole('button', { name: 'Modifier' })
    expect(editButtons).toHaveLength(3)
    fireEvent.click(editButtons[0])
    const dialog = await screen.findByRole('dialog', { name: 'Configurer le routage' })
    fireEvent.change(within(dialog).getByLabelText('Moteur'), { target: { value: 'google' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(screen.queryByRole('dialog', { name: 'Configurer le routage' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, routing: { provider: 'google', api_key_id: null } }))
  })

  it('shows the default Stadia satellite provider as available without a key', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /Pr.f.rences/ }))
    const satelliteRow = (await screen.findByText('Fond de carte satellite')).closest('article')
    expect(satelliteRow).not.toBeNull()
    expect(within(satelliteRow!).getAllByText('Sans clé')).toHaveLength(2)
    expect(within(satelliteRow!).queryByText('À configurer')).not.toBeInTheDocument()
  })

  it('opens TOTP configuration directly without an intermediate activation step', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(totpRow).not.toBeNull()
    fireEvent.click(within(totpRow!).getByRole('button', { name: 'Activer' }))
    expect(await screen.findByAltText('Code QR de configuration CartaVault')).toBeVisible()
    expect(startTotpSetup).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Activer l’authentification à deux facteurs' })).not.toBeInTheDocument()
  })

  it('uses the secondary TOTP action and a neutral available e-mail badge', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(totpRow).not.toBeNull()
    const action = within(totpRow!).getByRole('button', { name: 'Activer' })
    expect(action).toHaveClass('account-button--secondary')
    expect(action.querySelector('.lucide-chevron-right')).toBeInTheDocument()
    expect(screen.getByText('Disponible').closest('.account-api-service-badge')).toHaveClass('is-neutral')
  })
})
