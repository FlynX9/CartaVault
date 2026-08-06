import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountModal } from './AccountModal'
import { getAccountPreferences, getAccountProfile, getAccountSessions, getGooglePlacesCredential, getGoogleRoutesCredential, getOpenRouteServiceCredential, storeGooglePlacesCredential, storeGoogleRoutesCredential, updateAccountPreferences, updateAccountProfile, verifyGooglePlacesCredential, verifyGoogleRoutesCredential } from '../../api/account'
import { getRoutingProviders } from '../../api/routing'
import { getGoogleSatelliteCredential, getGoogleSatelliteStatus, storeGoogleSatelliteCredential, verifyGoogleSatelliteCredential } from '../../api/googleSatellite'
import { getStadiaMapsCredential, storeStadiaMapsCredential, verifyStadiaMapsCredential } from '../../api/stadiaMaps'
import { getStadiaPlacesCredential } from '../../api/stadiaPlaces'

vi.mock('../../api/account', () => ({
  accountAvatarUrl: (value: string | null) => value,
  changeAccountEmail: vi.fn(), changeAccountPassword: vi.fn(), deleteAccountAvatar: vi.fn(), deleteOwnAccount: vi.fn(),
  getAccountPreferences: vi.fn(), getAccountProfile: vi.fn(), getAccountSessions: vi.fn(), resetAccountPreferences: vi.fn(),
  getGoogleRoutesCredential: vi.fn(), storeGoogleRoutesCredential: vi.fn(), verifyGoogleRoutesCredential: vi.fn(), deleteGoogleRoutesCredential: vi.fn(),
  getGooglePlacesCredential: vi.fn(), storeGooglePlacesCredential: vi.fn(), verifyGooglePlacesCredential: vi.fn(), deleteGooglePlacesCredential: vi.fn(),
  getOpenRouteServiceCredential: vi.fn(), storeOpenRouteServiceCredential: vi.fn(), verifyOpenRouteServiceCredential: vi.fn(), deleteOpenRouteServiceCredential: vi.fn(),
  revokeAccountSession: vi.fn(), revokeOtherAccountSessions: vi.fn(), updateAccountPreferences: vi.fn(), updateAccountProfile: vi.fn(), uploadAccountAvatar: vi.fn(),
}))
vi.mock('../../api/routing', () => ({ getRoutingProviders: vi.fn() }))
vi.mock('../../api/googleSatellite', () => ({
  getGoogleSatelliteStatus: vi.fn(), getGoogleSatelliteCredential: vi.fn(), storeGoogleSatelliteCredential: vi.fn(), verifyGoogleSatelliteCredential: vi.fn(), deleteGoogleSatelliteCredential: vi.fn(),
}))
vi.mock('../../api/stadiaMaps', () => ({
  getStadiaMapsCredential: vi.fn(), storeStadiaMapsCredential: vi.fn(), verifyStadiaMapsCredential: vi.fn(), deleteStadiaMapsCredential: vi.fn(),
}))
vi.mock('../../api/stadiaPlaces', () => ({
  getStadiaPlacesCredential: vi.fn(), storeStadiaPlacesCredential: vi.fn(), verifyStadiaPlacesCredential: vi.fn(), deleteStadiaPlacesCredential: vi.fn(), getStadiaPlacesConfig: vi.fn(),
}))
const refresh = vi.fn()
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, avatar_url: null }, refresh }) }))

const profile = { id: 'user', display_name: 'Greg', email: 'greg@example.test', is_admin: true, is_active: true, avatar_url: null, created_at: '2026-01-01', updated_at: '2026-01-01', last_login_at: null, owned_maps: [], shared_map_count: 1, active_session_count: 1, can_delete: true }
const preferences = { language: 'fr' as const, preferred_basemap: 'cartavault-light' as const, density: 'comfortable' as const, startup_panel: 'maps' as const, timezone: 'Europe/Paris', trash_retention_days: 30, onboarding: { dismissed: false, completed_steps: [] as Array<'map' | 'place' | 'import' | 'trip' | 'organization'> }, routing: { provider: 'osrm' as const, stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' as const }, places: { provider: 'stadia' as const } }
const noCredential = { configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null }

beforeEach(() => { vi.mocked(getRoutingProviders).mockResolvedValue({ providers: [{ id: 'osrm', label: 'OSRM', available: true, supports_route: true, supports_matrix: true, supports_waypoint_optimization: false }, { id: 'google', label: 'Google Routes', available: false, credential_configured: false, credential_verified: false, supports_route: true, supports_matrix: false, supports_waypoint_optimization: true }, { id: 'openrouteservice', label: 'OpenRouteService', available: false, credential_configured: false, credential_verified: false, supports_route: true, supports_matrix: true, supports_waypoint_optimization: false }], default_provider: 'osrm', credential_storage_available: true }); vi.mocked(getGoogleRoutesCredential).mockResolvedValue(noCredential); vi.mocked(getGooglePlacesCredential).mockResolvedValue(noCredential); vi.mocked(getOpenRouteServiceCredential).mockResolvedValue({ ...noCredential, self_hosted: false }); vi.mocked(getGoogleSatelliteCredential).mockResolvedValue(noCredential); vi.mocked(getStadiaMapsCredential).mockResolvedValue(noCredential); vi.mocked(getStadiaPlacesCredential).mockResolvedValue(noCredential); vi.mocked(getGoogleSatelliteStatus).mockResolvedValue({ available: false, warning_level: 0 }); vi.mocked(getAccountProfile).mockResolvedValue(profile); vi.mocked(getAccountSessions).mockResolvedValue([]); vi.mocked(getAccountPreferences).mockResolvedValue(preferences); vi.mocked(updateAccountProfile).mockResolvedValue(profile); vi.mocked(updateAccountPreferences).mockResolvedValue({ ...preferences, routing: { ...preferences.routing, stay_in_country: true } }) })

function openApiGroup(name: 'Routage' | 'Recherche de lieux' | 'Fonds de carte') {
  fireEvent.click(screen.getByRole('button', { name }))
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AccountModal', () => {
  it('renders account sections separately from administration', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeVisible()
    for (const label of ['Profil', 'Sécurité', 'Sessions', 'Préférences', 'Clés API', 'Zone sensible']) expect(screen.getByRole('button', { name: label })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Avatar' })).not.toBeInTheDocument()
    expect(screen.getByText('Importer une image')).toBeVisible()
  })

  it('marks the global session revocation action as dangerous on interaction', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }))

    expect(screen.getByRole('button', { name: 'Révoquer les autres sessions' })).toHaveClass('account-button--danger-hover')
  })

  it('updates the display name and refreshes AuthProvider', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    const input = await screen.findByLabelText('Nom d’affichage')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountProfile).toHaveBeenCalledWith('Nouveau nom'))
    expect(refresh).toHaveBeenCalled()
  })

  it('uses the preference card design for profile and security sections', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    expect((await screen.findByRole('heading', { name: 'Informations de profil' })).closest('form')).toHaveClass('account-preference-card')
    expect(screen.getByRole('heading', { name: 'Avatar' }).closest('section')).toHaveClass('account-preference-card')
    expect(screen.getByRole('heading', { name: 'Informations du compte' }).closest('section')).toHaveClass('account-preference-card')

    fireEvent.click(screen.getByRole('button', { name: 'Sécurité' }))
    expect(screen.getByRole('heading', { name: 'Changer l’adresse e-mail' }).closest('form')).toHaveClass('account-security-card')
    expect(screen.getByRole('heading', { name: 'Changer le mot de passe' }).closest('form')).toHaveClass('account-security-card')
    expect(screen.getByRole('heading', { name: 'État de sécurité du compte' }).closest('section')).toHaveClass('account-security-overview')
    expect(screen.getAllByPlaceholderText('Saisissez votre mot de passe actuel')).toHaveLength(2)
    expect(screen.getByPlaceholderText('Minimum 12 caractères')).toBeVisible()
    expect(screen.getByPlaceholderText('Confirmez votre nouveau mot de passe')).toBeVisible()
  })

  it('persists the country-routing preference', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    expect(screen.getByRole('heading', { name: 'Général' }).closest('section')).toHaveClass('account-preference-card')
    expect(screen.queryByRole('heading', { name: 'Routage' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clés API' }))
    openApiGroup('Routage')
    expect(screen.getByRole('heading', { name: 'Routage' }).closest('section')).toHaveClass('account-preference-card--routing')
    expect(screen.getByRole('heading', { name: 'Options d’itinéraire' })).toBeVisible()
    const checkbox = screen.getByRole('checkbox', { name: 'Rester dans le pays' })
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, routing: { ...preferences.routing, stay_in_country: true } }))
  })

  it('persists the selected interface language', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    fireEvent.change(screen.getByLabelText('Langue'), { target: { value: 'en' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, language: 'en' }))
  })

  it('persists the trash retention period', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    fireEvent.change(screen.getByLabelText('Conservation de la corbeille'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, trash_retention_days: 60 }))
  })

  it('offers the dashboard as a startup screen and persists it', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Préférences' }))
    const startupScreen = screen.getByLabelText('Écran au démarrage')
    expect(screen.getByRole('option', { name: 'Tableau de bord' })).toBeVisible()
    fireEvent.change(startupScreen, { target: { value: 'dashboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, startup_panel: 'dashboard' }))
  })

  it('lets a user select Google Routes when personal credential storage is available', async () => {
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Routage')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Google Routes' })).not.toBeDisabled())
    cleanup()
    vi.mocked(getRoutingProviders).mockResolvedValue({ providers: [{ id: 'osrm', label: 'OSRM', available: true, supports_route: true, supports_matrix: true, supports_waypoint_optimization: false }, { id: 'google', label: 'Google Routes', available: true, credential_configured: true, credential_verified: true, supports_route: true, supports_matrix: false, supports_waypoint_optimization: true }], default_provider: 'osrm', credential_storage_available: true })
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Routage')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Google Routes' })).not.toBeDisabled())
    fireEvent.change(screen.getByLabelText('Moteur de calcul'), { target: { value: 'google' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(updateAccountPreferences).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Éviter les péages' })).toBeVisible()
    expect(screen.getByLabelText('Prise en compte du trafic')).toBeVisible()
  })

  it('stores a personal key without rendering it again and verifies the masked credential', async () => {
    const stored = { configured: true, last4: 'fake', verified: false, verified_at: null, last_used_at: null, last_error_code: null }
    const verified = { ...stored, verified: true, verified_at: '2026-07-19T10:00:00Z' }
    vi.mocked(storeGoogleRoutesCredential).mockResolvedValue(stored)
    vi.mocked(verifyGoogleRoutesCredential).mockResolvedValue(verified)
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Routage')
    fireEvent.change(screen.getByLabelText('Moteur de calcul'), { target: { value: 'google' } })
    const input = await screen.findByLabelText('Clé Google Routes', { selector: 'input' })
    const visibleInput = await screen.findByLabelText(/Google Routes/, { selector: 'input' })
    expect(visibleInput).toHaveAttribute('type', 'password')
    fireEvent.change(input, { target: { value: 'fake-user-key-not-valid' } })
    const routesPanel = input.closest('section')!
    fireEvent.click(within(routesPanel).getByRole('button', { name: 'Enregistrer cette clé' }))
    await waitFor(() => expect(storeGoogleRoutesCredential).toHaveBeenCalledWith('fake-user-key-not-valid'))
    expect(screen.queryByDisplayValue('fake-user-key-not-valid')).not.toBeInTheDocument()
    expect(within(routesPanel).getByRole('button', { name: 'Supprimer' })).toHaveClass('account-button--secondary', 'account-button--danger-hover')
    fireEvent.click(within(routesPanel).getByRole('button', { name: 'Vérifier' }))
    await waitFor(() => expect(verifyGoogleRoutesCredential).toHaveBeenCalled())
    expect(await screen.findByText('La clé Google Routes est valide.')).toBeVisible()
    expect(screen.getByText('19/07/2026')).toBeVisible()
  })

  it('keeps Stadia as the default Places engine and requires a separate verified Google Places key', async () => {
    const stored = { configured: true, last4: 'aces', verified: false, verified_at: null, last_used_at: null, last_error_code: null }
    const verified = { ...stored, verified: true, verified_at: '2026-08-03T10:00:00Z' }
    vi.mocked(storeGooglePlacesCredential).mockResolvedValue(stored)
    vi.mocked(verifyGooglePlacesCredential).mockResolvedValue(verified)
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Recherche de lieux')

    const engine = screen.getByLabelText('Moteur de recherche de lieux')
    expect(engine).toHaveValue('stadia')
    expect(await screen.findByLabelText('Clé Stadia Places', { selector: 'input' })).toBeVisible()
    expect(screen.queryByLabelText('Clé Google Places', { selector: 'input' })).not.toBeInTheDocument()
    fireEvent.change(engine, { target: { value: 'google' } })
    expect(screen.queryByLabelText('Clé Stadia Places', { selector: 'input' })).not.toBeInTheDocument()
    const input = await screen.findByLabelText('Clé Google Places', { selector: 'input' })
    fireEvent.change(input, { target: { value: 'fake-google-places' } })
    const placesPanel = input.closest('section')!
    fireEvent.click(within(placesPanel).getByRole('button', { name: 'Enregistrer cette clé' }))
    await waitFor(() => expect(storeGooglePlacesCredential).toHaveBeenCalledWith('fake-google-places'))
    fireEvent.click(within(placesPanel).getByRole('button', { name: 'Vérifier' }))
    await waitFor(() => expect(verifyGooglePlacesCredential).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateAccountPreferences).toHaveBeenCalledWith({ ...preferences, places: { provider: 'google' } }))
  })

  it('manages Google Map Tiles with a key distinct from Routes and Places', async () => {
    const stored = { configured: true, last4: 'tile', verified: false, verified_at: null, last_used_at: null, last_error_code: null }
    const verified = { ...stored, verified: true, verified_at: '2026-08-06T10:00:00Z' }
    vi.mocked(storeGoogleSatelliteCredential).mockResolvedValue(stored)
    vi.mocked(verifyGoogleSatelliteCredential).mockResolvedValue(verified)
    vi.mocked(getGoogleSatelliteStatus).mockResolvedValue({ available: true, warning_level: 0 })
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Fonds de carte')
    expect(screen.getByRole('heading', { name: 'Routage' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Recherche de lieux' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Fonds de carte' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Fournisseur satellite'), { target: { value: 'google' } })
    expect(screen.queryByLabelText('Clé Stadia Maps', { selector: 'input' })).not.toBeInTheDocument()
    const input = await screen.findByLabelText('Clé Google Map Tiles', { selector: 'input' })
    fireEvent.change(input, { target: { value: 'fake-map-tiles-key' } })
    const mapPanel = input.closest('section')!
    fireEvent.click(within(mapPanel).getByRole('button', { name: 'Enregistrer cette clé' }))
    await waitFor(() => expect(storeGoogleSatelliteCredential).toHaveBeenCalledWith('fake-map-tiles-key'))
    fireEvent.click(within(mapPanel).getByRole('button', { name: 'Vérifier' }))
    await waitFor(() => expect(verifyGoogleSatelliteCredential).toHaveBeenCalled())
    expect(storeGoogleRoutesCredential).not.toHaveBeenCalled()
    expect(storeGooglePlacesCredential).not.toHaveBeenCalled()
  })

  it('offers an optional personal Stadia Maps key for the satellite basemap', async () => {
    const stored = { configured: true, last4: 'adia', verified: false, verified_at: null, last_used_at: null, last_error_code: null }
    const verified = { ...stored, verified: true, verified_at: '2026-08-06T11:00:00Z' }
    vi.mocked(storeStadiaMapsCredential).mockResolvedValue(stored)
    vi.mocked(verifyStadiaMapsCredential).mockResolvedValue(verified)
    render(<AccountModal onClose={vi.fn()} onOpenAdmin={vi.fn()} trigger={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clés API' }))
    openApiGroup('Fonds de carte')
    expect(await screen.findByText('Accès public sans clé personnelle')).toBeVisible()
    const input = screen.getByLabelText('Clé Stadia Maps', { selector: 'input' })
    fireEvent.change(input, { target: { value: 'fake-stadia-personal' } })
    const panel = input.closest('section')!
    fireEvent.click(within(panel).getByRole('button', { name: 'Enregistrer cette clé' }))
    await waitFor(() => expect(storeStadiaMapsCredential).toHaveBeenCalledWith('fake-stadia-personal'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Vérifier' }))
    await waitFor(() => expect(verifyStadiaMapsCredential).toHaveBeenCalled())
    expect(await screen.findByText('La clé Stadia Maps est valide.')).toBeVisible()
  })
})
