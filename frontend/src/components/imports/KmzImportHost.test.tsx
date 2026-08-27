import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmKmzImport, previewKmzImport } from '../../api/imports'
import { KmzImportHost, KMZ_IMPORTED_EVENT, openKmzImport } from './KmzImportHost'

vi.mock('../../api/imports', () => ({ previewKmzImport: vi.fn(), confirmKmzImport: vi.fn() }))

const poiMap = { id: 'map-id', name: 'Belgique' } as never
const preview = { import_id: '11111111-1111-4111-8111-111111111111', file_name: 'points.kmz', placemark_count: 1, valid_count: 1, warning_count: 0, error_count: 0, global_warnings: [], items: [{ source_index: 0, selected_by_default: true, name: 'Point importé', latitude: 50.8, longitude: 4.3, altitude: null, mapped_fields: { name: 'Point importé' }, custom_fields: {}, images: [], warnings: [], errors: [], importable: true, already_imported: false, duplicate_reason: null, outside_map_country: false }] }
const report = { created_count: 1, skipped_count: 0, error_count: 0, images_added: 0, embedded_images_added: 0, remote_images_added: 0, remote_images_unavailable: 0, created_place_ids: ['place-id'], failures: [], warnings: [] }

describe('KmzImportHost', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('refreshes exactly once when a hidden import succeeds', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue(preview)
    let resolveImport!: (value: typeof report) => void
    vi.mocked(confirmKmzImport).mockImplementation(() => new Promise((resolve) => { resolveImport = resolve }))
    const imported = vi.fn()
    window.addEventListener(KMZ_IMPORTED_EVENT, imported)
    render(<KmzImportHost />)
    act(() => openKmzImport(poiMap))
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz')] } })
    await screen.findByText('Point importé')
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 POI/ }))
    await waitFor(() => expect(confirmKmzImport).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Fermer l.import/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => openKmzImport({ id: 'other-map', name: 'France' } as never))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    resolveImport(report)
    await waitFor(() => expect(imported).toHaveBeenCalledOnce())
    expect(confirmKmzImport).toHaveBeenCalledOnce()
    window.removeEventListener(KMZ_IMPORTED_EVENT, imported)
  })

  it('does not refresh when a hidden import fails', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue(preview)
    let rejectImport!: (reason: Error) => void
    vi.mocked(confirmKmzImport).mockImplementation(() => new Promise((_resolve, reject) => { rejectImport = reject }))
    const imported = vi.fn()
    window.addEventListener(KMZ_IMPORTED_EVENT, imported)
    render(<KmzImportHost />)
    act(() => openKmzImport(poiMap))
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz')] } })
    await screen.findByText('Point importé')
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 POI/ }))
    await waitFor(() => expect(confirmKmzImport).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: /Fermer l.import/ }))
    rejectImport(new Error('Import refusé'))
    await waitFor(() => expect(confirmKmzImport).toHaveBeenCalledOnce())
    expect(imported).not.toHaveBeenCalled()
    window.removeEventListener(KMZ_IMPORTED_EVENT, imported)
  })

  it('preserves the completion report while the dialog remains open', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue(preview)
    vi.mocked(confirmKmzImport).mockResolvedValue(report)
    render(<KmzImportHost />)
    act(() => openKmzImport(poiMap))
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz')] } })
    await screen.findByText('Point importé')

    fireEvent.click(screen.getByRole('button', { name: /Importer 1 POI/ }))

    expect(await screen.findByRole('heading', { name: /Import termin/ })).toBeVisible()
  })
})
