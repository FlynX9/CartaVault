import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { AdminConsole } from './AdminConsole'
import { getAdminCredentials, getAdminUsers, getInstanceHealth, refreshInstanceHealth, updateAdminUser } from '../../api/adminConsole'

vi.mock('../../api/adminConsole', () => ({
  deleteResendCredential: vi.fn(), getAdminCredentials: vi.fn(), getAdminQuotas: vi.fn(), getAdminUsers: vi.fn(), getInstanceHealth: vi.fn(), refreshInstanceHealth: vi.fn(),
  saveAdminQuotas: vi.fn(), saveResendCredential: vi.fn(), saveUserQuota: vi.fn(), updateAdminUser: vi.fn(), verifyResendCredential: vi.fn(),
}))
vi.mock('../../api/registration', () => ({ getRegistrationRequests: vi.fn().mockResolvedValue([]), reviewRegistration: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { display_name: 'Admin CartaVault' } }) }))

beforeEach(() => {
  vi.mocked(getAdminUsers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25, pages: 1 })
  vi.mocked(getAdminCredentials).mockResolvedValue([])
  vi.mocked(getInstanceHealth).mockResolvedValue(instanceHealth)
  vi.mocked(refreshInstanceHealth).mockResolvedValue(instanceHealth)
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

  it('renders normalized instance diagnostics and refreshes them explicitly', async () => {
    render(<MemoryRouter initialEntries={['/admin/instance']}><AdminConsole /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'État de l’instance' })).toBeVisible()
    expect(screen.getByText('PostgreSQL')).toBeVisible()
    expect(screen.getByText('Sauvegardes')).toBeVisible()
    expect(screen.getAllByText('Inconnu').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }))
    await waitFor(() => expect(refreshInstanceHealth).toHaveBeenCalledOnce())
  })
})

const diagnosticBase = { status: 'operational' as const, checked_at: '2026-07-22T12:00:00Z', error_code: null }
const instanceHealth = {
  checked_at: '2026-07-22T12:00:00Z', global_status: 'degraded' as const,
  summary: { version: '1.0.0', environment: 'test', uptime_seconds: 3600, public_url: null }, cache_ttl_seconds: 30, warnings: [], recent_errors: [],
  components: {
    application: { ...diagnosticBase, version: '1.0.0', backend_version: '1.0.0', frontend_version: null, build_commit: null, build_date: null, environment: 'test', started_at: '2026-07-22T11:00:00Z', uptime_seconds: 3600, public_url_configured: null, public_url_detected: null, deployment_mode: 'test', backend_replicas: null, debug_enabled: false },
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
}
