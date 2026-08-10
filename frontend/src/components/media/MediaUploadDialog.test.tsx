import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMediaUploadPolicy } from '../../api/media'
import { getMaps } from '../../api/maps'
import { MediaUploadDialog } from './MediaUploadDialog'

vi.mock('../../api/media', () => ({
  getMediaUploadPolicy: vi.fn(),
  uploadMedia: vi.fn(),
}))
vi.mock('../../api/maps', () => ({ getMaps: vi.fn() }))

describe('MediaUploadDialog', () => {
  beforeEach(() => {
    vi.mocked(getMaps).mockResolvedValue([{
      id: 'map-1', name: 'France', country: { name: 'France' }, can_edit: true,
    }] as never)
    vi.mocked(getMediaUploadPolicy).mockResolvedValue({
      max_upload_bytes: 5 * 1024 * 1024,
      max_upload_megabytes: 5,
      max_image_dimension: 2560,
    })
  })

  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a dedicated importer dialog with its controls', async () => {
    render(<MediaUploadDialog onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    expect(screen.getByLabelText('Carte')).toHaveValue('map-1')
    expect(screen.getByRole('button', { name: /Choisir des photos/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /Prendre une photo/i })).toBeVisible()
  })
})
