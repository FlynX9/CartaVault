import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCategories } from '../../api/categories'
import { getStatuses } from '../../api/statuses'
import { getTags } from '../../api/tags'
import { getUsers } from '../../api/users'
import { getEmailSettings, getRegistrationRequests, reviewRegistration } from '../../api/registration'
import { CategoriesWorkspacePanel, StatusesWorkspacePanel, TagsWorkspacePanel, UsersWorkspacePanel } from './WorkspaceManagementPanels'

vi.mock('../../api/categories', () => ({ getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }))
vi.mock('../../api/tags', () => ({ getTags: vi.fn(), createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn() }))
vi.mock('../../api/statuses', () => ({ getStatuses: vi.fn(), createStatus: vi.fn(), updateStatus: vi.fn(), deleteStatus: vi.fn() }))
vi.mock('../../api/users', () => ({ getUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn() }))
vi.mock('../../api/registration', () => ({ getRegistrationRequests: vi.fn(), reviewRegistration: vi.fn(), getEmailSettings: vi.fn(), saveEmailSettings: vi.fn() }))

beforeEach(() => {
  vi.mocked(getCategories).mockResolvedValue([{ id: 'category-id', name: 'Patrimoine', description: 'Ancien bâti', icon: 'mdi:castle' }])
  vi.mocked(getTags).mockResolvedValue([{ id: 'tag-id', name: 'Historique' }])
  vi.mocked(getStatuses).mockResolvedValue([{ id: 'status-id', map_id: 'map-id', name: 'À voir', slug: 'a-voir', color: '#2563EB', functional_state: 'non_visited', sort_order: 10, is_default: false, is_active: true, places_count: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }])
  vi.mocked(getUsers).mockResolvedValue([{ id: 'user-id', email: 'admin@example.test', display_name: 'Marie Admin', is_admin: true, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', last_login_at: null }])
  vi.mocked(getRegistrationRequests).mockResolvedValue([{ id: 'request-id', email: 'candidate@example.test', display_name: 'candidate', status: 'pending', created_at: '2026-07-21T00:00:00Z', reviewed_at: null, notification_sent_at: null, notification_error_code: null }])
  vi.mocked(getEmailSettings).mockResolvedValue({ configured: true, last4: '1234' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('workspace management panels', () => {
  it('renders compact category actions and its shared search field', async () => {
    const { container } = render(<CategoriesWorkspacePanel />)
    expect(await screen.findByText('Patrimoine')).toBeVisible()
    expect(document.getElementById('workspace-categories-panel')).toHaveClass('cv-workspace-panel')
    expect(container.querySelector('[data-category-icon-id="mdi:castle"]')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Rechercher une catégorie')).toBeVisible()
    expect(screen.getByPlaceholderText('Rechercher une catégorie').closest('label')).toHaveClass('cv-workspace-panel__search')
    expect(screen.getByRole('button', { name: 'Créer une catégorie' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Modifier Patrimoine' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Supprimer Patrimoine' })).toHaveClass('panel-icon-button')
  })

  it('renders compact tags without changing the CRUD search behavior', async () => {
    render(<TagsWorkspacePanel />)
    expect(await screen.findByText('Historique')).toBeVisible()
    fireEvent.change(screen.getByPlaceholderText('Rechercher un tag'), { target: { value: 'his' } })
    await waitFor(() => expect(getTags).toHaveBeenLastCalledWith(expect.any(AbortSignal), 'his'))
  })

  it('renders statuses with compact metadata and icon-only actions', async () => {
    render(<StatusesWorkspacePanel mapId="map-id" />)
    expect(await screen.findByText('À voir')).toBeVisible()
    expect(screen.getByPlaceholderText('Rechercher un statut')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Créer un statut' })).toBeVisible()
    expect(screen.getByText('Ordre 10')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Créer un statut' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Modifier À voir' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Supprimer À voir' })).toHaveClass('panel-icon-button')
  })

  it('renders administration as a closable users panel without duplicating statuses', async () => {
    const onClose = vi.fn()
    render(<UsersWorkspacePanel onClose={onClose} />)
    expect(await screen.findByText('Marie Admin')).toBeVisible()
    expect(document.getElementById('workspace-admin-panel')).toHaveClass('cv-workspace-panel')
    expect(screen.getByPlaceholderText('Rechercher un utilisateur').closest('label')).toHaveClass('cv-workspace-panel__search')
    expect(screen.queryByText('Statuts de suivi')).not.toBeInTheDocument()
    expect(await screen.findByText('candidate@example.test')).toBeVisible()
    expect(screen.getByText('Resend ••••1234')).toBeVisible()
    vi.mocked(reviewRegistration).mockResolvedValue({ id: 'request-id', email: 'candidate@example.test', display_name: 'candidate', status: 'approved', created_at: '2026-07-21T00:00:00Z', reviewed_at: '2026-07-21T01:00:00Z', notification_sent_at: '2026-07-21T01:00:00Z', notification_error_code: null })
    fireEvent.click(screen.getByRole('button', { name: 'Accepter candidate@example.test' }))
    await waitFor(() => expect(reviewRegistration).toHaveBeenCalledWith('request-id', 'approve'))
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le panneau' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
