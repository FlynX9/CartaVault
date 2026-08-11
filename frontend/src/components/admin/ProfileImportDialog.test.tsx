import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCategories } from '../../api/categories'
import { getMapProfiles, importMapProfileResources } from '../../api/maps'
import { getStatuses } from '../../api/statuses'
import { getTags } from '../../api/tags'
import type { StarterProfile } from '../../types/map'
import { ProfileImportDialog } from './ProfileImportDialog'

vi.mock('../../api/categories', () => ({ getCategories: vi.fn() }))
vi.mock('../../api/statuses', () => ({ getStatuses: vi.fn() }))
vi.mock('../../api/tags', () => ({ getTags: vi.fn() }))
vi.mock('../../api/maps', () => ({ getMapProfiles: vi.fn(), importMapProfileResources: vi.fn() }))
vi.mock('../icons/CategoryIconPreview', () => ({ CategoryIconPreview: () => <span data-testid="category-icon" /> }))

const PROFILE: StarterProfile = {
  id: 'tourism',
  name: 'Tourisme',
  description: 'Visites et découvertes touristiques.',
  ui_icon: 'luggage',
  categories: [
    { key: 'museum', name: 'Musée', icon_id: 'museum', sort_order: 10 },
    { key: 'monument', name: 'Monument', icon_id: 'landmark', sort_order: 20 },
  ],
  tags: [{ key: 'favorite', name: 'Favori', color: '#D99A2B', sort_order: 10 }],
  statuses: [{ key: 'planned', name: 'Planifié', color: '#6366F1', sort_order: 10, functional_state: 'non_visited', is_default: false }],
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ProfileImportDialog', () => {
  it('previews only categories that will actually be created', async () => {
    vi.mocked(getMapProfiles).mockResolvedValue([PROFILE])
    vi.mocked(getCategories).mockResolvedValue([{ id: 'category-1', map_id: 'map-1', name: 'Musée', description: null, icon: 'museum', marks_as_visited: false, places_count: 0 }])
    vi.mocked(getTags).mockResolvedValue([])
    vi.mocked(getStatuses).mockResolvedValue([])
    vi.mocked(importMapProfileResources).mockResolvedValue({ created: 1, skipped: 1 })

    render(<ProfileImportDialog mapId="map-1" resourceType="categories" onClose={vi.fn()} onImported={vi.fn()} />)
    fireEvent.click(await screen.findByRole('radio', { name: /Tourisme/ }))

    expect(screen.getByText('Éléments à créer')).toBeVisible()
    expect(screen.getByText('Monument')).toBeVisible()
    expect(screen.queryByText('Musée')).not.toBeInTheDocument()
    expect(screen.getByText(/1 déjà présent ignoré/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveClass('cv-home-action-button')
    expect(screen.getByRole('button', { name: /Importer/ })).toHaveClass('cv-home-action-button', 'primary')
    expect(screen.getByRole('button', { name: /Importer/ })).toBeEnabled()
  })

  it('disables import when every profile entry already exists', async () => {
    vi.mocked(getMapProfiles).mockResolvedValue([PROFILE])
    vi.mocked(getTags).mockResolvedValue([{ id: 'tag-1', map_id: 'map-1', name: 'Favori', color: '#D99A2B', places_count: 0 }])
    vi.mocked(getCategories).mockResolvedValue([])
    vi.mocked(getStatuses).mockResolvedValue([])

    render(<ProfileImportDialog mapId="map-1" resourceType="tags" onClose={vi.fn()} onImported={vi.fn()} />)
    fireEvent.click(await screen.findByRole('radio', { name: /Tourisme/ }))

    await waitFor(() => expect(screen.getByText('Tous les éléments de ce profil existent déjà sur la carte.')).toBeVisible())
    expect(screen.getByRole('button', { name: /Importer/ })).toBeDisabled()
  })
})
