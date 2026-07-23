import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bulkDeleteMedia, deleteMedia, getMedia, setMainMedia, updateMedia } from '../../api/media'
import type { MediaPage } from '../../types/media'
import { MediaWorkspacePanel } from './MediaWorkspacePanel'

vi.mock('../../api/media', async () => {
  const actual = await vi.importActual<typeof import('../../api/media')>('../../api/media')
  return {
    ...actual,
    getMedia: vi.fn(),
    updateMedia: vi.fn(),
    setMainMedia: vi.fn(),
    deleteMedia: vi.fn(),
    bulkDeleteMedia: vi.fn(),
  }
})

const page: MediaPage = {
  items: [{
    id: 'media-1',
    original_name: 'chapelle.webp',
    caption: 'Façade',
    taken_at: null,
    created_at: '2026-07-20T08:00:00',
    updated_at: '2026-07-20T08:00:00',
    is_primary: true,
    mime_type: 'image/webp',
    format: 'WEBP',
    file_size_bytes: 1024,
    width: 800,
    height: 600,
    file_state: 'healthy',
    can_edit: true,
    place: { id: 'place-1', name: 'Chapelle', region: 'Lorraine' },
    map: { id: 'map-1', name: 'France', country_code: 'FR', country_name: 'France' },
    uploader: { id: 'user-1', name: 'Alice' },
  }],
  page: 1,
  page_size: 30,
  total: 1,
  pages: 1,
  aggregates: { total_count: 1, total_size_bytes: 1024, primary_count: 1, missing_count: 0, error_count: 0 },
  filters: { maps: [{ id: 'map-1', name: 'France', country_code: 'FR', country_name: 'France' }], formats: ['WEBP'], uploaders: [{ id: 'user-1', name: 'Alice' }] },
}

describe('MediaWorkspacePanel', () => {
  beforeEach(() => {
    vi.mocked(getMedia).mockResolvedValue(page)
    vi.mocked(updateMedia).mockResolvedValue(page.items[0])
    vi.mocked(setMainMedia).mockResolvedValue(page.items[0])
    vi.mocked(deleteMedia).mockResolvedValue()
    vi.mocked(bulkDeleteMedia).mockResolvedValue()
  })
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

  it('renders accessible media metadata and opens its place', async () => {
    const openPlace = vi.fn()
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={openPlace} />)
    expect(await screen.findByText('chapelle.webp')).toBeVisible()
    expect(screen.getByText('Chapelle')).toBeVisible()
    expect(screen.getByText('France · FR')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir chapelle.webp/i }))
    const dialog = await screen.findByRole('dialog', { name: 'chapelle.webp' })
    expect(dialog).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir le lieu' }))
    expect(openPlace).toHaveBeenCalledWith(page.items[0])
  })

  it('debounces search and applies server-side filters', async () => {
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.change(screen.getByPlaceholderText(/Search|Rechercher/i), { target: { value: 'chapelle' } })
    await waitFor(() => expect(getMedia).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'chapelle' }), expect.any(AbortSignal)))
  })

  it('shows bulk actions after selecting an item', async () => {
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner' }))
    expect(screen.getByText('1 sélectionné(s)')).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Supprimer/ }).at(-1)).toBeVisible()
  })
})
