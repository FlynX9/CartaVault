import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { uploadPreparedMedia } from '../../media/uploadProcessing'
import { MediaUploadDialog } from './MediaUploadDialog'

vi.mock('../../media/uploadProcessing', () => ({ uploadPreparedMedia: vi.fn() }))

const maps = [
  { id: 'map-a', name: 'France', country: { name: 'France' }, can_edit: true },
  { id: 'map-b', name: 'Italie', country: { name: 'Italie' }, can_edit: true },
] as never

describe('MediaUploadDialog', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a dedicated importer dialog with its controls', async () => {
    render(<MediaUploadDialog maps={maps} onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    expect(screen.getByLabelText('Carte')).toHaveValue('map-a')
    expect(screen.getByRole('button', { name: /Choisir des photos/i })).toHaveClass('account-button', 'account-button--secondary')
    expect(screen.getByRole('button', { name: /Prendre une photo/i })).toHaveClass('account-button', 'account-button--primary')
  })

  it('uploads with the map selected when the upload starts', async () => {
    const { container } = render(<MediaUploadDialog maps={maps} onClose={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Carte'), { target: { value: 'map-b' } })
    const file = new File(['photo'], 'photo.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"][multiple]')!, { target: { files: [file] } })
    await waitFor(() => expect(uploadPreparedMedia).toHaveBeenCalledWith([file], 'map-b'))
  })
})
