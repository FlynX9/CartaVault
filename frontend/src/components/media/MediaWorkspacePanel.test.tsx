import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bulkDeleteMedia, deleteMedia, getMedia, getMediaUploadPolicy, setMainMedia, updateMedia } from '../../api/media'
import { getMaps } from '../../api/maps'
import type { MediaPage } from '../../types/media'
import { MediaWorkspacePanel } from './MediaWorkspacePanel'
import { FloatingPanelWindowContext } from '../layout/FloatingPanelWindow'

vi.mock('../../api/media', async () => {
  const actual = await vi.importActual<typeof import('../../api/media')>('../../api/media')
  return {
    ...actual,
    getMedia: vi.fn(),
    updateMedia: vi.fn(),
    setMainMedia: vi.fn(),
    deleteMedia: vi.fn(),
    bulkDeleteMedia: vi.fn(),
    getMediaUploadPolicy: vi.fn(),
  }
})

vi.mock('../../api/maps', () => ({ getMaps: vi.fn() }))

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
    vi.mocked(getMaps).mockResolvedValue([{ id: 'map-1', name: 'France', country: { name: 'France' }, can_edit: true }] as never)
    vi.mocked(getMediaUploadPolicy).mockResolvedValue({ max_upload_bytes: 5 * 1024 * 1024, max_upload_megabytes: 5, max_image_dimension: 2560 })
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

  it('keeps the create-place action available from an orphaned GPS photo and its details', async () => {
    const orphaned = { ...page.items[0], place: null, latitude: 48.8566, longitude: 2.3522, can_create_place: true }
    vi.mocked(getMedia).mockResolvedValue({ ...page, items: [orphaned] })
    const onCreate = vi.fn()
    window.addEventListener('cartavault:create-place-from-media', onCreate)
    try {
      render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
      const createButton = await screen.findByRole('button', { name: 'Créer un POI' })
      fireEvent.click(createButton)
      expect(onCreate).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: /Ouvrir chapelle.webp/i }))
      const dialog = await screen.findByRole('dialog', { name: 'chapelle.webp' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Créer un POI' }))
      expect(onCreate).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener('cartavault:create-place-from-media', onCreate)
    }
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

  it('maximizes its floating desktop window on request', async () => {
    const toggleMaximize = vi.fn()
    const { rerender } = render(<FloatingPanelWindowContext.Provider value={{ locked: false, maximized: false, toggleMaximize }}><MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} /></FloatingPanelWindowContext.Provider>)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir la fenêtre Médias au maximum' }))
    expect(toggleMaximize).toHaveBeenCalledOnce()
    rerender(<FloatingPanelWindowContext.Provider value={{ locked: false, maximized: true, toggleMaximize }}><MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} /></FloatingPanelWindowContext.Provider>)
    const restore = screen.getByRole('button', { name: 'Rétablir la taille précédente de la fenêtre Médias' })
    expect(restore.querySelector('.lucide-minimize-2')).toBeInTheDocument()
    fireEvent.click(restore)
    expect(toggleMaximize).toHaveBeenCalledTimes(2)
  })

  it('keeps the upload dialog open when mobile navigation layers are closed', async () => {
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Importer des photos' }))
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    window.dispatchEvent(new Event('cartavault:close-mobile-modal-layers'))
    expect(screen.getByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
  })
})
