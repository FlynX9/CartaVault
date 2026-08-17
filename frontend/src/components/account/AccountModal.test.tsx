import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountModal } from './AccountModal'
import { getAccountPreferences, getAccountProfile, getAccountSessions, getEmailMfaStatus, getPersonalApiKeys, getTotpStatus, startTotpSetup, updateAccountPreferences, updateAccountProfile } from '../../api/account'

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
const preferences = { language: 'fr' as const, default_theme: 'system' as const, preferred_basemap: 'osm' as const, density: 'comfortable' as const, startup_panel: 'maps' as const, timezone: 'Europe/Paris', trash_retention_days: 30, photo_markers_enabled: false, onboarding: { dismissed: false, completed_steps: [] as Array<'map' | 'place' | 'import' | 'trip' | 'organization'> }, routing: { provider: 'osrm' as const }, places: { provider: 'stadia' as const }, basemaps: { classic_provider: 'osm' as const, satellite_provider: 'none' as const } }

beforeEach(async () => {
  const account = await import('../../api/account')
  vi.mocked(account.getTotpStatus).mockResolvedValue({ enabled: false, verified_at: null, recovery_codes_remaining: 0 })
  vi.mocked(account.getEmailMfaStatus).mockResolvedValue({ enabled: false, verified_at: null, available: true })
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

  it('opens the crop editor before uploading a selected avatar', async () => {
    const account = await import('../../api/account')
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    await screen.findByRole('heading', { name: 'Profil' })
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*="image/jpeg"]')
    expect(input).not.toBeNull()

    fireEvent.change(input!, { target: { files: [new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })] } })

    expect(screen.getByRole('dialog', { name: 'Recadrer la photo' })).toBeVisible()
    expect(account.uploadAccountAvatar).not.toHaveBeenCalled()
  })

  it('stages the onboarding guide visibility from the profile section', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    expect(await screen.findByRole('heading', { name: 'Guide de démarrage' })).toBeVisible()

    fireEvent.click(screen.getByRole('switch', { name: 'Afficher le guide de démarrage' }))
    expect(screen.getByText('Masqué')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, onboarding: { ...preferences.onboarding, dismissed: true } }))
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
    expect(editButtons).toHaveLength(4)
    fireEvent.click(editButtons[0])
    const dialog = await screen.findByRole('dialog', { name: 'Configurer le routage' })
    expect(within(dialog).getByText('Choisissez le service à utiliser et la clé API personnelle à lui associer.').closest('header')).not.toBeNull()
    expect(dialog.querySelector('.account-integration-dialog__icon')).not.toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Moteur'), { target: { value: 'google' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(screen.queryByRole('dialog', { name: 'Configurer le routage' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, routing: { provider: 'google', api_key_id: null } }))
  })

  it('shows OSM and the disabled satellite provider as available without a key', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: /Pr.f.rences/ }))
    const satelliteRow = (await screen.findByText('Cartographie satellite')).closest('article')
    expect(satelliteRow).not.toBeNull()
    expect(within(satelliteRow!).getByText('Désactivée')).toBeVisible()
    expect(within(satelliteRow!).getByText('Sans clé')).toBeVisible()
    expect(within(satelliteRow!).queryByText('À configurer')).not.toBeInTheDocument()
  })

  it('opens TOTP configuration directly without an intermediate activation step', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(totpRow).not.toBeNull()
    fireEvent.click(within(totpRow!).getByRole('button', { name: 'Configurer' }))
    expect(await screen.findByAltText('Code QR de configuration CartaVault')).toBeVisible()
    const dialog = screen.getByRole('dialog', { name: 'Application d’authentification (TOTP)' })
    expect(within(dialog).getByText('Scannez le QR Code ou ajoutez la clé dans votre application, puis saisissez le code généré.').closest('header')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Copier' })).toBeVisible()
    expect(within(dialog).getByRole('link', { name: 'Ouvrir' })).toBeVisible()
    expect(within(dialog).getByRole('group', { name: 'Code à 6 chiffres' }).querySelectorAll('input')).toHaveLength(6)
    expect(within(dialog).getByText(/Pour finaliser l’activation/)).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Vérifier et activer' })).toBeDisabled()
    expect(startTotpSetup).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Activer l’authentification à deux facteurs' })).not.toBeInTheDocument()
  })

  it('uses a neutral secondary TOTP configuration action without chevron', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(totpRow).not.toBeNull()
    const action = within(totpRow!).getByRole('button', { name: 'Configurer' })
    expect(action).toHaveClass('account-button--secondary')
    expect(action.querySelector('.lucide-chevron-right')).not.toBeInTheDocument()
    expect(totpRow).not.toHaveClass('is-configured')
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument()
    const disabledMfaSummary = screen.getByText('MFA').closest('article')
    expect(disabledMfaSummary).toHaveClass('is-warning')
    expect(within(disabledMfaSummary!).getByText('Désactivé')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Conseil sécurité' })).toBeVisible()
  })

  it('keeps TOTP available as the replacement method when e-mail MFA is enabled', async () => {
    vi.mocked(getTotpStatus).mockResolvedValue({ enabled: false, verified_at: null, recovery_codes_remaining: 0 })
    vi.mocked(getEmailMfaStatus).mockResolvedValue({ enabled: true, verified_at: '2026-08-14T10:00:00Z', available: true })
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))

    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(within(totpRow!).getByRole('button', { name: 'Configurer' })).toBeEnabled()
    expect(totpRow).not.toHaveClass('is-configured')
    expect(screen.getByText('Code par e-mail').closest('article')).toHaveClass('is-configured')
    expect(screen.queryByText('Codes de récupération')).not.toBeInTheDocument()
    const emailMfaSummary = screen.getByText('MFA').closest('article')
    expect(emailMfaSummary).toHaveClass('is-success')
    expect(within(emailMfaSummary!).getByText('Activé')).toBeVisible()
    expect(screen.getByText('Pour une protection renforcée, privilégiez une application d’authentification (TOTP).')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Conseil sécurité' })).not.toBeInTheDocument()
  })

  it('highlights TOTP only when configured and hides the e-mail method', async () => {
    vi.mocked(getTotpStatus).mockResolvedValue({ enabled: true, verified_at: '2026-08-14T10:00:00Z', recovery_codes_remaining: 8 })
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))

    const totpRow = (await screen.findByText('Application d’authentification (TOTP)')).closest('article')
    expect(totpRow).toHaveClass('is-configured')
    expect(screen.queryByText('Code par e-mail')).not.toBeInTheDocument()
    expect(screen.getByText('Codes de récupération')).toBeVisible()
    const totpMfaSummary = screen.getByText('MFA').closest('article')
    expect(totpMfaSummary).toHaveClass('is-success')
    expect(within(totpMfaSummary!).getByText('Renforcée')).toBeVisible()
    expect(screen.getByText('Une méthode d’authentification à deux facteurs est active sur votre compte.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Conseil sécurité' })).not.toBeInTheDocument()
  })

  it('shows concise device, location, browser and activity session details', async () => {
    vi.mocked(getAccountSessions).mockResolvedValue([{
      id: 'session-1', created_at: '2026-08-14T08:00:00Z', last_used_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      expires_at: '2026-09-14T08:00:00Z', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
      is_current: false, city: 'Paris', country: 'France',
    }])
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))

    expect(await screen.findByText('PC Windows')).toBeVisible()
    expect(screen.getByText(/Paris, France · Chrome · Il y a [45] min/)).toBeVisible()
  })

  it('uses the live device and detects Brave for the current session', async () => {
    const originalUserAgent = navigator.userAgent
    const originalBrave = (navigator as Navigator & { brave?: unknown }).brave
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36' })
    Object.defineProperty(navigator, 'brave', { configurable: true, value: {} })
    vi.mocked(getAccountSessions).mockResolvedValue([{
      id: 'current-session', created_at: '2026-08-14T08:00:00Z', last_used_at: new Date().toISOString(), expires_at: '2026-09-14T08:00:00Z',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Version/18.5 Mobile/15E148 Safari/604.1', is_current: true,
    }])
    try {
      render(<AccountModal onClose={vi.fn()} trigger={null} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
      expect(await screen.findByText('PC Windows')).toBeVisible()
      expect(screen.getByText(/Localisation inconnue · Brave ·/)).toBeVisible()
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent })
      Object.defineProperty(navigator, 'brave', { configurable: true, value: originalBrave })
    }
  })

  it('makes the security card session list scrollable beyond three entries', async () => {
    vi.mocked(getAccountSessions).mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      id: `session-${index}`, created_at: '2026-08-14T08:00:00Z', last_used_at: new Date(Date.now() - index * 60_000).toISOString(),
      expires_at: '2026-09-14T08:00:00Z', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36',
      is_current: false, city: `Ville ${index + 1}`, country: 'France',
    })))
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))

    expect(await screen.findByText(/Ville 1, France/)).toBeVisible()
    expect(screen.getByText(/Ville 3, France/)).toBeVisible()
    expect(screen.getByText(/Ville 4, France/)).toBeInTheDocument()
    expect(screen.getByText(/Ville 1, France/).closest('ul')).toHaveClass('is-scrollable')
  })

  it('renders the redesigned e-mail change dialog and toggles password visibility', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const emailCard = screen.getByRole('heading', { name: 'Adresse e-mail' }).closest('article')
    fireEvent.click(within(emailCard!).getByRole('button', { name: 'Modifier' }))

    const dialog = await screen.findByRole('dialog', { name: 'Changer l’adresse e-mail' })
    expect(within(dialog).getByText('Mettez à jour l’adresse e-mail associée à votre compte.')).toBeVisible()
    expect(within(dialog).getByPlaceholderText('exemple@domaine.com')).toHaveAttribute('type', 'email')
    const password = within(dialog).getByPlaceholderText('Saisissez votre mot de passe actuel')
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(within(dialog).getByText(/nous vérifierons votre mot de passe/)).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog', { name: 'Changer l’adresse e-mail' })).not.toBeInTheDocument()
  })

  it('enforces and displays every password complexity rule in the password dialog', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const passwordCard = screen.getByRole('heading', { name: 'Mot de passe' }).closest('article')
    fireEvent.click(within(passwordCard!).getByRole('button', { name: 'Modifier' }))

    const dialog = await screen.findByRole('dialog', { name: 'Changer le mot de passe' })
    expect(within(dialog).getByText('Choisissez un mot de passe fort et unique pour sécuriser votre compte.')).toBeVisible()
    const currentPassword = within(dialog).getByPlaceholderText('Saisissez votre mot de passe actuel')
    const newPassword = within(dialog).getByPlaceholderText('Minimum 12 caractères')
    const confirmation = within(dialog).getByPlaceholderText('Confirmez votre nouveau mot de passe')
    const submit = within(dialog).getByRole('button', { name: 'Modifier le mot de passe' })
    expect(submit).toBeDisabled()

    fireEvent.change(currentPassword, { target: { value: 'Old Password 1!' } })
    fireEvent.change(newPassword, { target: { value: 'Strong Password 42!' } })
    fireEvent.change(confirmation, { target: { value: 'Strong Password 42!' } })
    expect(within(dialog).getByText('Fort')).toBeVisible()
    expect(within(dialog).getByText('Au moins 12 caractères').closest('li')).toHaveClass('is-valid')
    expect(within(dialog).getByText('1 majuscule et 1 minuscule').closest('li')).toHaveClass('is-valid')
    expect(within(dialog).getByText('1 chiffre').closest('li')).toHaveClass('is-valid')
    expect(within(dialog).getByText('1 caractère spécial').closest('li')).toHaveClass('is-valid')
    expect(submit).toBeEnabled()
  })

  it('places the sessions guidance in the dialog header', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gérer les sessions' }))

    const dialog = await screen.findByRole('dialog', { name: 'Sessions et appareils' })
    const guidance = within(dialog).getByText('Contrôlez les appareils actuellement connectés à votre compte.')
    expect(guidance.closest('header')).not.toBeNull()
  })

  it('renders the redesigned e-mail MFA activation dialog', async () => {
    render(<AccountModal onClose={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sécurité' }))
    const emailMfaCard = screen.getByText('Code par e-mail').closest('article')
    const activate = within(emailMfaCard!).getByRole('button', { name: 'Activer' })
    await waitFor(() => expect(activate).toBeEnabled())
    fireEvent.click(activate)

    const dialog = await screen.findByRole('dialog', { name: 'Code par e-mail' })
    expect(within(dialog).getByText('Recevez un code de sécurité à chaque connexion.').closest('header')).not.toBeNull()
    expect(within(dialog).getByText('À savoir')).toBeVisible()
    expect(within(dialog).getByText('greg@example.test')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Modifier l’e-mail' })).toBeVisible()
    const send = within(dialog).getByRole('button', { name: 'Envoyer un code' })
    expect(send).toBeDisabled()
    const password = within(dialog).getByPlaceholderText('Saisissez votre mot de passe actuel')
    fireEvent.change(password, { target: { value: 'Current Password 1!' } })
    expect(send).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(password).toHaveAttribute('type', 'text')
  })
})
