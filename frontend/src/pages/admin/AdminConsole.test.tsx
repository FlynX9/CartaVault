import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { AdminConsole } from './AdminConsole'
import { assignUserQuotaProfile, createQuotaProfile, getAdminApiKeys, getAdminUsers, getInstanceHealth, getInstanceLogRetention, getInstanceLogs, getMediaUploadSettings, getQuotaProfiles, getQuotaRegistry, getSaasSettings, getVectorBasemapLibrary, refreshInstanceHealth, saveInstanceLogRetention, saveMediaUploadSettings, saveSaasSettings, saveVectorBasemapSettings, updateAdminUser, updateQuotaProfile, verifyAdminApiKey } from '../../api/adminConsole'
import { getPublicRegistrationSettings, updatePublicRegistrationSettings } from '../../api/registration'
import { getAdminPrivacySettings, saveAdminPrivacySettings } from '../../api/privacy'
import { getGoogleSatelliteAdminStatus } from '../../api/googleSatellite'
import type { QuotaRegistryItem } from '../../types/adminConsole'

vi.mock('../../api/adminConsole', () => ({
  archiveQuotaProfile: vi.fn(), assignUserQuotaProfile: vi.fn(), createQuotaProfile: vi.fn(), deleteQuotaProfile: vi.fn(), deleteAdminApiKey: vi.fn(), duplicateQuotaProfile: vi.fn(),
  createAdminApiKey: vi.fn(), getAdminApiKeys: vi.fn(), getAdminUsers: vi.fn(), getInstanceHealth: vi.fn(), getInstanceLogRetention: vi.fn(), getInstanceLogs: vi.fn(), getMediaUploadSettings: vi.fn(), getQuotaProfiles: vi.fn(), getQuotaRegistry: vi.fn(), getSaasSettings: vi.fn(), getVectorBasemapLibrary: vi.fn(), refreshInstanceHealth: vi.fn(),
  cancelVectorBasemap: vi.fn(), deleteVectorBasemap: vi.fn(), installVectorBasemap: vi.fn(), saveInstanceLogRetention: vi.fn(), saveMediaUploadSettings: vi.fn(), saveSaasSettings: vi.fn(), saveVectorBasemapSettings: vi.fn(), setDefaultQuotaProfile: vi.fn(), updateAdminApiKey: vi.fn(), updateAdminUser: vi.fn(), updateQuotaProfile: vi.fn(), updateVectorBasemap: vi.fn(), verifyAdminApiKey: vi.fn(),
}))
vi.mock('../../api/registration', () => ({ getPublicRegistrationSettings: vi.fn().mockResolvedValue({ enabled: false, approval_required: true }), getRegistrationRequests: vi.fn().mockResolvedValue([]), reviewRegistration: vi.fn(), updatePublicRegistrationSettings: vi.fn() }))
vi.mock('../../api/privacy', () => ({ getAdminPrivacySettings: vi.fn(), saveAdminPrivacySettings: vi.fn() }))
vi.mock('../../api/googleSatellite', () => ({ getGoogleSatelliteAdminStatus: vi.fn(), saveGoogleSatelliteSettings: vi.fn(), resetGoogleSatelliteErrors: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { display_name: 'Admin CartaVault' } }) }))

beforeEach(() => {
  vi.mocked(getAdminUsers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25, pages: 1, summary: { active_users: 4, administrators: 2, maps: 7, places: 42 } })
  vi.mocked(getAdminApiKeys).mockResolvedValue([])
  vi.mocked(getQuotaProfiles).mockResolvedValue([unlimitedProfile])
  vi.mocked(getPublicRegistrationSettings).mockResolvedValue({ enabled: false, approval_required: true })
  vi.mocked(updatePublicRegistrationSettings).mockImplementation(async (settings) => settings)
  vi.mocked(getAdminPrivacySettings).mockResolvedValue(privacySettings)
  vi.mocked(saveAdminPrivacySettings).mockImplementation(async (settings) => ({ ...settings, consent_required: settings.analytics_mode === 'consent_required', consent_version: '1' }))
  vi.mocked(getQuotaRegistry).mockResolvedValue([])
  vi.mocked(getInstanceHealth).mockResolvedValue(instanceHealth)
  vi.mocked(getInstanceLogRetention).mockResolvedValue({ retention_days: 7 })
  vi.mocked(getMediaUploadSettings).mockResolvedValue({ max_upload_megabytes: 5, max_image_dimension: 2560 })
  vi.mocked(getSaasSettings).mockResolvedValue({ enabled: false })
  vi.mocked(getVectorBasemapLibrary).mockResolvedValue({ settings: { enabled: true, preparation_policy: 'on_first_cartavault_use', update_policy: 'disabled', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000 }, items: [] })
  vi.mocked(saveVectorBasemapSettings).mockImplementation(async (settings) => settings)
  vi.mocked(saveInstanceLogRetention).mockImplementation(async (retentionDays) => ({ retention_days: retentionDays }))
  vi.mocked(saveMediaUploadSettings).mockImplementation(async (maxUploadMegabytes, maxImageDimension) => ({ max_upload_megabytes: maxUploadMegabytes, max_image_dimension: maxImageDimension }))
  vi.mocked(saveSaasSettings).mockImplementation(async (enabled) => ({ enabled }))
  vi.mocked(getInstanceLogs).mockResolvedValue({ items: [], truncated: false, next_before: null, max_limit: 200, retention_entries: 2000, retention_days: 7, source: 'database' })
  vi.mocked(refreshInstanceHealth).mockResolvedValue(instanceHealth)
  vi.mocked(getGoogleSatelliteAdminStatus).mockResolvedValue({ available: false, warning_level: 0, settings: { enabled: false, daily_soft_limit: 10000, monthly_soft_limit: 100000, auto_disable_percent: 100, repeated_error_limit: 5, consecutive_errors: 0, disabled_reason: null }, usage: { sessions_today: 0, tiles_started_today: 0, tiles_completed_today: 0, tiles_failed_today: 0, tiles_cancelled_today: 0, tiles_started_month: 0 }, quota: { scope: 'instance', daily_limit: 10000, monthly_limit: 100000, daily_reset_at: '2026-08-17', monthly_reset_at: '2026-09-01', blocked: false, reason: null }, authoritative_monitoring: { connected: true, source: 'backend_proxy', console_url: 'https://console.cloud.google.com/google/maps-apis/metrics', notice: 'Authoritative' } })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AdminConsole', () => {
  it('renders its reusable navigation and empty users state', async () => {
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    const navigation = screen.getByRole('navigation', { name: 'Sections d’administration' })
    expect(navigation).toBeVisible()
    expect(within(navigation).getAllByRole('link').slice(0, 2).map((link) => link.textContent)).toEqual(['Général', 'Utilisateurs'])
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveClass('active')
    expect(await screen.findByText('Aucun utilisateur trouvé.')).toBeVisible()
    const summary = screen.getByRole('region', { name: 'Utilisateurs' })
    expect(within(summary).getByText('Comptes actifs')).toBeVisible()
    expect(within(summary).getByText('Administrateurs')).toBeVisible()
    expect(within(summary).getByText('Cartes')).toBeVisible()
    expect(within(summary).getByText('Lieux')).toBeVisible()
    expect(within(summary).queryByText('Sessions actives')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Inscriptions publiques' })).not.toBeInTheDocument()
    expect(getPublicRegistrationSettings).not.toHaveBeenCalled()
  })

  it('shows public registration settings in General', async () => {
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Inscriptions publiques' })).toBeVisible()
    const registrationSwitch = screen.getByRole('switch', { name: 'Activer les inscriptions publiques' })
    await waitFor(() => expect(registrationSwitch).not.toBeDisabled())
    expect(registrationSwitch).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Validation des demandes' })).toBeDisabled()
    expect(getPublicRegistrationSettings).toHaveBeenCalledOnce()

    fireEvent.click(registrationSwitch)
    expect(updatePublicRegistrationSettings).not.toHaveBeenCalled()
    const saveButton = screen.getByRole('button', { name: 'Enregistrer' })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)
    await waitFor(() => expect(updatePublicRegistrationSettings).toHaveBeenCalledWith({ enabled: true, approval_required: true }))
  })

  it('shows the live vector basemap preparation percentage', async () => {
    vi.mocked(getVectorBasemapLibrary).mockResolvedValue({
      settings: { enabled: true, preparation_policy: 'manual', update_policy: 'disabled', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000 },
      items: [{ country_code: 'BE', country_name: 'Belgique', state: 'generating', phase: 'Génération du fond', progress: 42, version: null, file_size: null, source_size: 1000, installed_at: null, source_date: null, min_zoom: null, max_zoom: null, schema: null, error_code: null, error_message: null, task_id: 'task-be', map_count: 1, supported: true }],
    })
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole /></MemoryRouter>)

    const progress = await screen.findByRole('progressbar', { name: 'Génération du fond de Belgique' })
    expect(progress).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('Génération du fond · 42 %')).toBeVisible()
  })

  it('allows an errored vector basemap to be deleted', async () => {
    vi.mocked(getVectorBasemapLibrary).mockResolvedValue({
      settings: { enabled: true, preparation_policy: 'manual', update_policy: 'disabled', min_zoom: 0, max_zoom: 14, offline_min_zoom: 5, offline_max_zoom: 14, offline_padding_km: 20, offline_max_tiles: 25000 },
      items: [{ country_code: 'FR', country_name: 'France', state: 'error', phase: 'Erreur', progress: null, version: null, file_size: null, source_size: null, installed_at: null, source_date: null, min_zoom: null, max_zoom: null, schema: null, error_code: 'GENERATION_FAILED', error_message: 'Échec', task_id: null, map_count: 1, supported: true }],
    })
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: 'Supprimer' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })

  it('only reveals privacy inputs after enabling the section and saves its selected mode from the header', async () => {
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole /></MemoryRouter>)

    const privacyToggle = await screen.findByRole('switch', { name: 'Activer la confidentialité et la conformité' })
    expect(privacyToggle).not.toBeChecked()
    expect(screen.queryByLabelText('Nom de l’instance')).not.toBeInTheDocument()

    fireEvent.click(privacyToggle)
    expect(screen.getByRole('button', { name: /^Respect de la vie privée/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Nom de l’instance')).toBeVisible()
    expect(screen.getByLabelText('Contact de l’instance')).toHaveAttribute('placeholder', 'admin@exemple.fr')
    fireEvent.click(screen.getByRole('button', { name: /^Consentement requis/ }))
    expect(saveAdminPrivacySettings).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(saveAdminPrivacySettings).toHaveBeenCalledWith(expect.objectContaining({ analytics_mode: 'consent_required' })))
  })

  it('navigates to credentials without reloading the application', async () => {
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Clés API' })).toBeVisible()
    await waitFor(() => expect(getAdminApiKeys).toHaveBeenCalled())
  })

  it('keeps drafts between tabs and saves all modified settings from the header', async () => {
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole /></MemoryRouter>)

    const saveButton = screen.getByRole('button', { name: 'Enregistrer' })
    expect(saveButton).toBeDisabled()
    const mediaLimit = await screen.findByLabelText(/Taille maximale par image/)
    const retention = await screen.findByLabelText(/Durée de conservation/)
    fireEvent.change(mediaLimit, { target: { value: '8' } })
    fireEvent.change(retention, { target: { value: '14' } })
    expect(saveButton).toBeEnabled()

    fireEvent.click(screen.getByRole('link', { name: 'Clés API' }))
    expect(await screen.findByRole('heading', { name: 'Clés API' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Général' }))
    expect(mediaLimit).toHaveValue(8)
    expect(retention).toHaveValue(14)

    fireEvent.click(saveButton)
    await waitFor(() => {
      expect(saveMediaUploadSettings).toHaveBeenCalledWith(8, 2560)
      expect(saveInstanceLogRetention).toHaveBeenCalledWith(14)
      expect(saveButton).toBeDisabled()
    })
    expect(saveSaasSettings).not.toHaveBeenCalled()
  })

  it('asks what to do with unsaved changes before closing', async () => {
    const onClose = vi.fn()
    render(<MemoryRouter initialEntries={['/admin/general']}><AdminConsole onClose={onClose} /></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText(/Taille maximale par image/), { target: { value: '9' } })

    fireEvent.click(screen.getByRole('button', { name: /Fermer l’administration/ }))
    const warning = await screen.findByRole('alertdialog', { name: /Enregistrer ou Annuler les modifications/ })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(warning).getByRole('button', { name: 'Continuer l’édition' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Fermer l’administration/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Annuler les modifications' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(saveMediaUploadSettings).not.toHaveBeenCalled()
  })

  it('does not expose an expected request cancellation as a panel error', async () => {
    vi.mocked(getAdminApiKeys)
      .mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('signal is aborted without reason')))
      }))
      .mockResolvedValueOnce([])

    render(<StrictMode><MemoryRouter initialEntries={['/admin/credentials']}><AdminConsole /></MemoryRouter></StrictMode>)

    await waitFor(() => expect(getAdminApiKeys).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('signal is aborted without reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sends a Resend test email explicitly', async () => {
    const resend = {
      id: '11111111-1111-4111-8111-111111111111', name: 'Resend',
      provider: 'resend',
      last4: 'test', verified: false, editable: true,
      verified_at: null,
      last_used_at: null,
      last_error_code: null,
      last_error_status: null, last_error_message: null, last_error_at: null,
      created_at: '2026-07-24T12:00:00Z', updated_at: '2026-07-24T12:00:00Z',
    } as const
    vi.mocked(getAdminApiKeys).mockResolvedValue([resend])
    vi.mocked(verifyAdminApiKey).mockResolvedValue({
      ...resend,
      verified: true,
      verified_at: '2026-07-24T12:00:00Z',
      last_used_at: '2026-07-24T12:00:00Z',
    })

    render(<MemoryRouter initialEntries={['/admin/credentials']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer un test' }))

    await waitFor(() => expect(verifyAdminApiKey).toHaveBeenCalledWith(resend.id))
    expect(await screen.findByText(/Test de la clé Resend « Resend » réussi : e-mail envoyé à votre adresse administrateur\./)).toBeVisible()
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
      id: '11111111-1111-4111-8111-111111111111', email: 'user@example.test', display_name: 'Utilisateur', avatar_url: null,
      role: 'user' as const, state: 'active' as const, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
      last_login_at: null, owned_map_count: 0, shared_map_count: 0, place_count: 0,
      quota_profile_id: unlimitedProfile.id, quota_profile_name: unlimitedProfile.name,
    }
    vi.mocked(getAdminUsers).mockResolvedValue({ items: [target], total: 1, page: 1, page_size: 25, pages: 1 })
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: `Actions pour ${target.display_name}` }))
    fireEvent.click(screen.getByRole('button', { name: /Promouvoir/ }))
    const roleDialog = screen.getByRole('alertdialog', { name: `Promouvoir ${target.display_name}` })
    expect(roleDialog).toBeVisible()
    expect(roleDialog.parentElement).toHaveClass('admin-user-action-overlay')
    fireEvent.click(screen.getByRole('button', { name: 'Promouvoir' }))
    await waitFor(() => expect(updateAdminUser).toHaveBeenCalledWith(target.id, { role: 'admin' }))
  })

  it('closes the user action menu when tapping outside it', async () => {
    const target = {
      id: '11111111-1111-4111-8111-111111111111', email: 'user@example.test', display_name: 'Utilisateur', avatar_url: null,
      role: 'user' as const, state: 'active' as const, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
      last_login_at: null, owned_map_count: 0, shared_map_count: 0, place_count: 0,
      quota_profile_id: unlimitedProfile.id, quota_profile_name: unlimitedProfile.name,
    }
    vi.mocked(getAdminUsers).mockResolvedValue({ items: [target], total: 1, page: 1, page_size: 25, pages: 1 })
    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)

    const trigger = await screen.findByRole('button', { name: `Actions pour ${target.display_name}` })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: /Promouvoir/ })).toBeVisible()

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('button', { name: /Promouvoir/ })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('warns before assigning a profile that is below current map usage', async () => {
    const target = {
      id: '11111111-1111-4111-8111-111111111111', email: 'user@example.test', display_name: 'Utilisateur',
      avatar_url: null,
      role: 'user' as const, state: 'active' as const, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
      last_login_at: null, owned_map_count: 7, shared_map_count: 0, place_count: 0,
      quota_profile_id: unlimitedProfile.id, quota_profile_name: unlimitedProfile.name,
    }
    const restricted = { ...unlimitedProfile, id: '22222222-2222-4222-8222-222222222222', name: 'Standard', is_default: false, is_system: false, assigned_users_count: 0, limits: { ...unlimitedProfile.limits, maps_max: 5 } }
    vi.mocked(getAdminUsers).mockResolvedValue({ items: [target], total: 1, page: 1, page_size: 25, pages: 1 })
    vi.mocked(getQuotaProfiles).mockResolvedValue([unlimitedProfile, restricted])

    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: `Actions pour ${target.display_name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le quota' }))
    const dialog = screen.getByRole('dialog', { name: 'Modifier le quota' })
    expect(dialog.parentElement).toHaveClass('admin-user-quota-overlay')
    fireEvent.change(within(dialog).getByLabelText('Profil de quota'), { target: { value: restricted.id } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(assignUserQuotaProfile).toHaveBeenCalledWith(target.id, restricted.id))
  })

  it('renders a user avatar when the administration API provides one', async () => {
    const target = {
      id: '11111111-1111-4111-8111-111111111111', email: 'avatar@example.test', display_name: 'Avatar User',
      avatar_url: '/admin/console/users/11111111-1111-4111-8111-111111111111/avatar?v=1',
      role: 'user' as const, state: 'active' as const, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
      last_login_at: null, owned_map_count: 0, shared_map_count: 0, place_count: 0,
      quota_profile_id: unlimitedProfile.id, quota_profile_name: unlimitedProfile.name,
    }
    vi.mocked(getAdminUsers).mockResolvedValue({ items: [target], total: 1, page: 1, page_size: 25, pages: 1 })

    render(<MemoryRouter initialEntries={['/admin/users']}><AdminConsole /></MemoryRouter>)

    await screen.findByText(target.display_name)
    const avatar = document.querySelector<HTMLImageElement>('.admin-users__avatar img')
    expect(avatar).not.toBeNull()
    expect(avatar).toHaveAttribute('src', expect.stringContaining(target.avatar_url))
  })

  it('renders normalized instance diagnostics and refreshes them explicitly', async () => {
    render(<MemoryRouter initialEntries={['/admin/instance']}><AdminConsole /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'État de l’instance' })).toBeVisible()
    expect(await screen.findByText('PostgreSQL / PostGIS')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostiques' }))
    expect(await screen.findByText('Sauvegardes')).toBeVisible()
    expect(screen.getAllByText('Inconnu').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() => expect(refreshInstanceHealth).toHaveBeenCalledOnce())
  })

  it('loads bounded application logs from the merged instance screen', async () => {
    vi.mocked(getInstanceLogs).mockResolvedValue({
      items: [{ id: 7, timestamp: '2026-07-22T12:00:00Z', level: 'WARNING', component: 'ROUTING', logger: 'app.routing', message: 'Provider unavailable' }],
      truncated: false, next_before: null, max_limit: 200, retention_entries: 2000, retention_days: 7, source: 'database',
    })

    render(<MemoryRouter initialEntries={['/admin/instance']}><AdminConsole /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Journaux' }))

    expect(await screen.findByText('Provider unavailable')).toBeVisible()
    expect(screen.getAllByText('ROUTING').length).toBeGreaterThan(0)
    expect(getInstanceLogs).toHaveBeenCalled()
  })

  it('renders quota profiles without duplicating instance usage metrics', async () => {
    vi.mocked(getQuotaRegistry).mockResolvedValue([
      { key: 'maps_max', scope: 'user', unit: 'count', label: 'Cartes', description: 'Nombre de cartes possédées', minimum: 0, maximum: 2147483647, enforced: true },
    ])

    render(<StrictMode><MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter></StrictMode>)

    expect(await screen.findByRole('heading', { name: 'Quotas' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Illimité' })).toBeVisible()
    expect(screen.getAllByText('Par défaut').length).toBeGreaterThan(0)
    expect(screen.getByText('Système')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Nouveau profil' })).toBeVisible()
    expect(screen.queryByText('Usages par utilisateur')).not.toBeInTheDocument()
  })

  it('cycles through quota profiles with the carousel controls', async () => {
    const secondProfile = { ...unlimitedProfile, id: 'standard-profile', name: 'Standard', is_default: false, is_system: false }
    const thirdProfile = { ...unlimitedProfile, id: 'large-profile', name: 'Large', is_default: false, is_system: false }
    vi.mocked(getQuotaProfiles).mockResolvedValue([unlimitedProfile, secondProfile, thirdProfile])
    vi.mocked(getQuotaRegistry).mockResolvedValue(quotaRegistry)

    render(<MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter>)

    const next = await screen.findByRole('button', { name: 'Profil suivant' })
    const previous = screen.getByRole('button', { name: 'Profil précédent' })
    expect(screen.getByLabelText('Profil 1 sur 3')).toBeVisible()
    fireEvent.click(next)
    expect(screen.getByLabelText('Profil 2 sur 3')).toBeVisible()
    fireEvent.click(previous)
    expect(screen.getByLabelText('Profil 1 sur 3')).toBeVisible()
    fireEvent.click(previous)
    expect(screen.getByLabelText('Profil 3 sur 3')).toBeVisible()
    const carousel = screen.getByLabelText('Profils de quotas')
    fireEvent.touchStart(carousel.querySelector('.quota-carousel__viewport')!, { touches: [{ clientX: 260, clientY: 120 }] })
    fireEvent.touchEnd(carousel.querySelector('.quota-carousel__viewport')!, { changedTouches: [{ clientX: 120, clientY: 126 }] })
    expect(screen.getByLabelText('Profil 1 sur 3')).toBeVisible()
  })

  it('creates a quota profile from the tabbed modal and keeps the page compact', async () => {
    vi.mocked(getQuotaRegistry).mockResolvedValue(quotaRegistry)
    vi.mocked(createQuotaProfile).mockResolvedValue({ ...unlimitedProfile, id: 'new-profile', name: 'X-Large', is_default: false, is_system: false })
    render(<StrictMode><MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter></StrictMode>)

    fireEvent.click(await screen.findByRole('button', { name: 'Nouveau profil' }))
    const dialog = screen.getByRole('dialog', { name: 'Nouveau profil de quotas' })
    expect(dialog).toBeVisible()
    expect(screen.queryByText('Créer un profil')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Médias' }))
    expect(within(dialog).getByText('Stockage')).toBeVisible()
    const storageUnlimited = within(dialog).getAllByRole('checkbox').find((checkbox) => checkbox.parentElement?.textContent?.includes('Illimité'))!
    fireEvent.click(storageUnlimited)
    expect(within(dialog).getByRole('spinbutton', { name: 'Valeur pour Stockage Gio' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le profil' }))
    expect(await within(dialog).findByText('Le nom du profil est obligatoire.')).toBeVisible()
    expect(within(dialog).getByRole('tab', { name: /Général/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'X-Large' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le profil' }))
    await waitFor(() => expect(createQuotaProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'X-Large', is_active: true })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nouveau profil de quotas' })).not.toBeInTheDocument())
    expect(screen.getByText('X-Large')).toBeVisible()
  })

  it('edits a profile in the modal and warns before discarding changes', async () => {
    const editable = { ...unlimitedProfile, id: 'editable-profile', name: 'X-Large', is_default: false, is_system: false }
    vi.mocked(getQuotaProfiles).mockResolvedValue([editable])
    vi.mocked(getQuotaRegistry).mockResolvedValue(quotaRegistry)
    vi.mocked(updateQuotaProfile).mockResolvedValue({ ...editable, description: 'Mis à jour' })
    render(<MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: /Modifier/ }))
    const dialog = screen.getByRole('dialog', { name: 'Modifier X-Large' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Fermer' })).toHaveFocus())
    expect(within(dialog).getByLabelText('Nom')).not.toHaveFocus()
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Texte modifié' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    const warning = await screen.findByRole('alertdialog', { name: 'Modifications non enregistrées' })
    fireEvent.click(within(warning).getByRole('button', { name: 'Continuer l’édition' }))
    expect(dialog).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateQuotaProfile).toHaveBeenCalledWith(editable.id, expect.objectContaining({ description: 'Texte modifié' })))
  })

  it('prevents editing the system unlimited profile', async () => {
    vi.mocked(getQuotaRegistry).mockResolvedValue(quotaRegistry)
    render(<MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter>)
    const edit = await screen.findByRole('button', { name: /Modifier/ })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAttribute('title', 'Le profil système Illimité ne peut pas être modifié.')
    expect(screen.queryByRole('dialog', { name: /Modifier/ })).not.toBeInTheDocument()
  })

  it('keeps a non-system default quota profile active', async () => {
    const defaultProfile = { ...unlimitedProfile, id: 'default-profile', name: 'Standard', is_system: false }
    vi.mocked(getQuotaProfiles).mockResolvedValue([defaultProfile])
    vi.mocked(getQuotaRegistry).mockResolvedValue(quotaRegistry)
    render(<MemoryRouter initialEntries={['/admin/quotas']}><AdminConsole /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: /Modifier/ }))
    const dialog = screen.getByRole('dialog', { name: 'Modifier Standard' })
    expect(within(dialog).getByRole('checkbox', { name: /Profil actif/ })).toBeDisabled()
    expect(within(dialog).getByText('Le profil par défaut doit rester actif.')).toBeVisible()
  })
})

const quotaRegistry: QuotaRegistryItem[] = [
  { key: 'maps_max', scope: 'user', unit: 'count', label: 'Cartes', description: 'Nombre de cartes possédées', minimum: 0, maximum: 2147483647, enforced: true },
  { key: 'storage_bytes_max', scope: 'user', unit: 'bytes', label: 'Stockage', description: 'Volume total des médias', minimum: 0, maximum: Number.MAX_SAFE_INTEGER, enforced: true },
]

const privacySettings = {
  analytics_mode: 'disabled' as const, consent_required: false, consent_version: '1', operator_name: '', privacy_policy_url: '', cookie_policy_url: '', contact_email: '', auth_log_retention_days: 90, session_retention_days: 30, deleted_account_retention_days: 0,
}

const unlimitedProfile = {
  id: '00000000-0000-0000-0000-000000000001', name: 'Unlimited', description: null,
  is_default: true, is_system: true, is_active: true, assigned_users_count: 1,
  created_at: '2026-07-22T12:00:00Z', updated_at: '2026-07-22T12:00:00Z',
  limits: {
    maps_max: null, trips_total_max: null, storage_bytes_max: null, photos_total_max: null,
    memberships_total_max: null, pending_invitations_max: null, places_per_map_max: null,
    tags_per_map_max: null, categories_per_map_max: null, statuses_per_map_max: null,
    trips_per_map_max: null, members_per_map_max: null, pending_invitations_per_map_max: null,
    photos_per_place_max: null, links_per_place_max: null, days_per_trip_max: null, steps_per_day_max: null,
    image_upload_megabytes_max: null, image_dimension_max: null,
    google_satellite_tiles_daily_max: null, google_satellite_tiles_monthly_max: null,
  },
}

const diagnosticBase = { status: 'operational' as const, checked_at: '2026-07-22T12:00:00Z', error_code: null }
const instanceHealth = {
  checked_at: '2026-07-22T12:00:00Z', global_status: 'degraded' as const,
  summary: { version: '1.0.0', environment: 'test', uptime_seconds: 3600, public_url: null }, cache_ttl_seconds: 30, warnings: [], recent_errors: [],
  components: {
    application: { ...diagnosticBase, version: '1.0.0', backend_version: '1.0.0', frontend_version: null, build_commit: null, build_date: null, environment: 'test', started_at: '2026-07-22T11:00:00Z', uptime_seconds: 3600, public_url_configured: null, public_url_detected: null, deployment_mode: 'test', backend_replicas: null, debug_enabled: false },
    resources: { ...diagnosticBase, cpu_percent: null, cpu_scope: 'unavailable', cpu_limit_cores: null, memory_used_bytes: null, memory_limit_bytes: null, memory_percent: null, memory_scope: 'unavailable', worker_count: null, worker_source: null },
    database: { ...diagnosticBase, connection_ok: true, latency_ms: 2, postgresql_version: 'PostgreSQL', postgis_available: true, postgis_version: '3.5', database_size_bytes: 1024, active_connections: 2, max_connections: 100, pool_size: 5, pool_checked_out: 1, pool_overflow: 0, alembic_current_revision: 'head', alembic_expected_revision: 'head', alembic_status: 'up_to_date' as const, last_controlled_error: null },
    storage: { ...diagnosticBase, backend_type: 'local' as const, logical_identifier: 'local-media', readable: true, writable: true, total_bytes: 1000, used_bytes: 500, free_bytes: 500, usage_percent: 50, photo_count: 2, photo_storage_bytes: null, temporary_export_count: 0, temporary_export_bytes: 0, temporary_file_count: null, orphan_file_count: null, warning_threshold_percent: 70, high_threshold_percent: 85, critical_threshold_percent: 95, last_controlled_error: null },
    usage: { ...diagnosticBase, users_total: 2, users_active: 2, users_unverified: null, users_disabled: 0, administrators_total: 1, maps_total: 3, maps_private: 2, maps_shared: 1, places_total: 4, trashed_places: 0, photos_total: 2, trips_total: 1, memberships_total: 2, invitations_pending: 0, storage_average_per_user_bytes: null, new_users_7d: 1, new_users_30d: 1, new_places_7d: 2, new_places_30d: 4 },
    authentication: { ...diagnosticBase, password_hash_algorithm: 'argon2id', active_sessions: 1, expired_sessions_pending_cleanup: 0, session_ttl_seconds: 86400, cookie_secure: true, cookie_http_only: true, cookie_same_site: 'lax', csrf_enabled: true, rate_limiting_enabled: null, failed_logins_24h: null, temporarily_limited_accounts: null, mfa_available: false, mfa_enabled_users: 0, mfa_required_for_admins: false, mfa_required_globally: false },
    https: { ...diagnosticBase, status: 'unknown' as const, https_detected: false, configured_public_scheme: null, detected_request_scheme: 'http', trusted_proxy_configured: false, forwarded_proto_consistent: null, canonical_url_consistent: null, certificate_available: null, certificate_valid: null, certificate_issuer: null, certificate_not_before: null, certificate_expires_at: null, certificate_days_remaining: null, http_to_https_redirect_configured: null, hsts_enabled: null, last_controlled_error: null },
    email: { ...diagnosticBase, status: 'misconfigured' as const, provider: 'resend', configured: false, sender_address: null, reply_to_address: null, sender_domain: null, domain_verified: null, last_success_at: null, last_failure_at: null, last_error_code: null, sent_24h: null, failed_24h: null, sent_30d: null, failed_30d: null, failure_rate: null, quota_limit: null, quota_used: null },
    mapping: { ...diagnosticBase, osm_configured: true, light_layer_configured: null, dark_layer_configured: null, satellite_configured: null, stadia_configured: false, fallback_layer: 'osm', last_controlled_error: null },
    routing: { ...diagnosticBase, default_provider: 'osrm', osrm_configured: true, osrm_available: true, osrm_latency_ms: 10, google_routes_enabled: true, google_routes_global_configured: true, users_with_verified_google_routes_credentials: 0, fallback_to_osrm_enabled: true, last_provider: null, last_success_at: null, last_failure_at: null, last_error_code: null },
    maintenance: { ...diagnosticBase, expired_action_tokens: 0, expired_sessions: 0, expired_invitations: 0, temporary_exports_pending_cleanup: 0, temporary_files_pending_cleanup: null, orphan_media_count: null, last_cleanup_at: null, next_cleanup_at: null, cleanup_enabled: false, pending_migrations: false },
    backups: { ...diagnosticBase, status: 'unknown' as const, configured: false, known: false, last_database_backup_at: null, last_media_backup_at: null, last_secrets_backup_at: null, last_backup_status: null, last_backup_size_bytes: null, destination_type: null, last_restore_test_at: null, retention_policy_known: false, last_controlled_error: 'BACKUP_STATUS_UNKNOWN' },
    security: { ...diagnosticBase, status: 'degraded' as const, disclaimer: 'Diagnostic seulement.', checks: [{ code: 'security.backup_known', severity: 'high' as const, passed: null, message_key: 'backup', details: {}, action: null }] },
  },
  alerts: [],
}
