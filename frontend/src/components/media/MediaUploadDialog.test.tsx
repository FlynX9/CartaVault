import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaUploadDialog } from './MediaUploadDialog'

describe('MediaUploadDialog', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a dedicated importer dialog with its controls', async () => {
    render(<MediaUploadDialog onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    expect(screen.getByLabelText('Carte')).toHaveValue('map-1')
    expect(screen.getByRole('button', { name: /Choisir des photos/i })).toHaveClass('account-button', 'account-button--secondary')
    expect(screen.getByRole('button', { name: /Prendre une photo/i })).toHaveClass('account-button', 'account-button--primary')
  })
})
