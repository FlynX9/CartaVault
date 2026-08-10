import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaUploadDialog } from './MediaUploadDialog'

const maps = [{ id: 'map-1', name: 'France', country: { name: 'France' }, can_edit: true }]

describe('MediaUploadDialog', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a dedicated importer dialog with its controls', async () => {
    render(<MediaUploadDialog maps={maps as never} onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    expect(screen.getByLabelText('Carte')).toHaveValue('map-1')
    expect(screen.getByRole('button', { name: /Choisir des photos/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /Prendre une photo/i })).toBeVisible()
  })
})
