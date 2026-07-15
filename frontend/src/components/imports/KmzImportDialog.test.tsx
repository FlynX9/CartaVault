import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { confirmKmzImport, previewKmzImport } from '../../api/imports'
import { KmzImportDialog } from './KmzImportDialog'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

vi.mock('../../api/imports', () => ({ previewKmzImport: vi.fn(), confirmKmzImport: vi.fn() }))

const poiMap = { id: 'map-id', name: 'Belgique' } as never
const preview = { import_id: '11111111-1111-4111-8111-111111111111', file_name: 'points.kmz', placemark_count: 1, valid_count: 1, warning_count: 0, error_count: 0, global_warnings: [], items: [{ source_index: 0, selected_by_default: true, name: 'Point importé', latitude: 50.8, longitude: 4.3, altitude: null, mapped_fields: { name: 'Point importé' }, custom_fields: { Architecte: 'Jane Doe' }, images: [], warnings: [], errors: [], importable: true, already_imported: false }] }

describe('KmzImportDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('requires analysis before confirmation and refreshes only after confirmation', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue(preview)
    vi.mocked(confirmKmzImport).mockResolvedValue({ created_count: 1, skipped_count: 0, error_count: 0, images_added: 0, embedded_images_added: 0, remote_images_added: 0, remote_images_unavailable: 0, created_place_ids: ['place-id'], failures: [], warnings: [] })
    const imported = vi.fn()
    render(<KmzImportDialog poiMap={poiMap} onClose={vi.fn()} onImported={imported} />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz', { type: 'application/vnd.google-earth.kmz' })] } })
    await screen.findByText('Point importé')
    expect(confirmKmzImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(/Donn/))
    expect(screen.getByText('Architecte')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 POI/ }))
    await waitFor(() => expect(confirmKmzImport).toHaveBeenCalledWith('map-id', preview.import_id, [0], false, []))
    expect(imported).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: /Import termin/ })).toBeVisible()
  })

  it('rejects a non-KMZ file before the API is called', () => {
    render(<KmzImportDialog poiMap={poiMap} onClose={vi.fn()} onImported={vi.fn()} />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['text'], 'points.kml', { type: 'application/xml' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent('fichier KMZ')
    expect(previewKmzImport).not.toHaveBeenCalled()
  })

  it('leaves an already imported point out of the default selection', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue({
      ...preview,
      valid_count: 0,
      items: [{ ...preview.items[0], importable: false, already_imported: true }],
    })
    render(<KmzImportDialog poiMap={poiMap} onClose={vi.fn()} onImported={vi.fn()} />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz', { type: 'application/vnd.google-earth.kmz' })] } })
    await screen.findByText('Point importé')
    const checkbox = document.body.querySelector('.kmz-import-items input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(screen.getByRole('button', { name: /Importer 0 POI/ })).toBeDisabled()
  })

  it('allows an explicit force import for a detected duplicate', async () => {
    vi.mocked(previewKmzImport).mockResolvedValue({
      ...preview,
      valid_count: 0,
      items: [{ ...preview.items[0], importable: false, already_imported: true }],
    })
    vi.mocked(confirmKmzImport).mockResolvedValue({ created_count: 1, skipped_count: 0, error_count: 0, images_added: 0, embedded_images_added: 0, remote_images_added: 0, remote_images_unavailable: 0, created_place_ids: ['place-id'], failures: [], warnings: [] })
    render(<KmzImportDialog poiMap={poiMap} onClose={vi.fn()} onImported={vi.fn()} />)
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'points.kmz', { type: 'application/vnd.google-earth.kmz' })] } })
    await screen.findByText('Point importé')
    fireEvent.click(screen.getByRole('button', { name: /Forcer l.import/ }))
    fireEvent.click(screen.getByRole('button', { name: /Importer 1 POI/ }))
    await waitFor(() => expect(confirmKmzImport).toHaveBeenCalledWith('map-id', preview.import_id, [0], false, [0]))
  })
})
