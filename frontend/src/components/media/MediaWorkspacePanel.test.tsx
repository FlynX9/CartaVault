import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bulkDeleteMedia, deleteMedia, getMedia, getMediaUploadPolicy, setMainMedia, updateMedia } from '../../api/media'
import { getMaps } from '../../api/maps'
import type { MediaPage } from '../../types/media'
import type { PoiMap } from '../../types/map'
import { MediaWorkspacePanel } from './MediaWorkspacePanel'
import { FloatingPanelWindowContext } from '../layout/FloatingPanelWindow'

vi.mock('../../api/media', async () => {
  const actual = await vi.importActual<typeof import('../../api/media')>('../../api/media')
  return {
    ...actual,
    getMedia: vi.fn(),
    getMediaUploadPolicy: vi.fn(),
    updateMedia: vi.fn(),
    setMainMedia: vi.fn(),
    deleteMedia: vi.fn(),
    bulkDeleteMedia: vi.fn(),
  }
})

vi.mock('../../api/maps', async () => {
  const actual = await vi.importActual<typeof import('../../api/maps')>('../../api/maps')
  return { ...actual, getMaps: vi.fn() }
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

const editableMap = {
  id: 'map-1', name: 'France', country_id: 'country-1',
  country: { id: 'country-1', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' },
  center_latitude: null, center_longitude: null, default_zoom: null,
  effective_center_latitude: 46.5, effective_center_longitude: 2.5, effective_default_zoom: 6,
  min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null,
  created_at: '2026-07-20T08:00:00', updated_at: '2026-07-20T08:00:00',
  can_edit: true, place_count: 1, trip_count: 0,
} as PoiMap

describe('MediaWorkspacePanel', () => {
  beforeEach(() => {
    vi.mocked(getMedia).mockResolvedValue(page)
    vi.mocked(getMediaUploadPolicy).mockResolvedValue({ max_upload_megabytes: 5, max_upload_bytes: 5 * 1024 * 1024 })
    vi.mocked(getMaps).mockResolvedValue([editableMap])
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

  it('keeps the upload dialog mounted after its asynchronous configuration resolves', async () => {
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Importer des photos' }))

    const dialog = await screen.findByRole('dialog', { name: 'Importer des photos' })
    expect(dialog).toBeVisible()
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'France · France' })).toBeInTheDocument())
    expect(within(dialog).getByRole('button', { name: 'Choisir des photos' })).toBeEnabled()
    expect(screen.getByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
  })

  it('does not crash the application when an editable cached map has incomplete country metadata', async () => {
    vi.mocked(getMaps).mockResolvedValue([{ ...editableMap, country: undefined } as unknown as PoiMap])
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Importer des photos' }))

    const dialog = await screen.findByRole('dialog', { name: 'Importer des photos' })
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'France · Pays inconnu' })).toBeInTheDocument())
    expect(screen.getByText('chapelle.webp')).toBeVisible()
    expect(dialog).toBeVisible()
  })

  it('keeps the dialog usable with a safe upload limit when the policy request fails', async () => {
    vi.mocked(getMediaUploadPolicy).mockRejectedValue(new Error('policy unavailable'))
    render(<MediaWorkspacePanel onClose={vi.fn()} onOpenPlace={vi.fn()} />)
    await screen.findByText('chapelle.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Importer des photos' }))

    const dialog = await screen.findByRole('dialog', { name: 'Importer des photos' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Choisir des photos' })).toBeEnabled())
    expect(within(dialog).getByRole('alert')).toHaveTextContent('valeur de sécurité par défaut')
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
})