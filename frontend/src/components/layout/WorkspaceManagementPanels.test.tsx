import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCategories } from '../../api/categories'
import { getStatuses } from '../../api/statuses'
import { getTags } from '../../api/tags'
import { CategoriesWorkspacePanel, StatusesWorkspacePanel, TagsWorkspacePanel } from './WorkspaceManagementPanels'

vi.mock('../../api/categories', () => ({ getCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }))
vi.mock('../../api/tags', () => ({ getTags: vi.fn(), createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn() }))
vi.mock('../../api/statuses', () => ({ getStatuses: vi.fn(), createStatus: vi.fn(), updateStatus: vi.fn(), deleteStatus: vi.fn() }))

beforeEach(() => {
  vi.mocked(getCategories).mockResolvedValue([{ id: 'category-id', name: 'Patrimoine', description: 'Ancien bâti', icon: 'mdi:castle' }])
  vi.mocked(getTags).mockResolvedValue([{ id: 'tag-id', name: 'Historique' }])
  vi.mocked(getStatuses).mockResolvedValue([{ id: 'status-id', name: 'À voir', slug: 'a-voir', color: '#2563EB', sort_order: 10, is_default: false, is_active: true, places_count: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }])
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
    render(<StatusesWorkspacePanel />)
    expect(await screen.findByText('À voir')).toBeVisible()
    expect(screen.getByPlaceholderText('Rechercher un statut')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Créer un statut' })).toBeVisible()
    expect(screen.getByText('Ordre 10')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Créer un statut' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Modifier À voir' })).toHaveClass('panel-icon-button')
    expect(screen.getByRole('button', { name: 'Supprimer À voir' })).toHaveClass('panel-icon-button')
  })
})
