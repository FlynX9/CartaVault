import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MediaUploadHost } from './MediaUploadHost'

describe('MediaUploadHost', () => {
  afterEach(cleanup)

  it('opens the importer from the root-level event host', async () => {
    const { container } = render(<MediaUploadHost />)
    window.dispatchEvent(new CustomEvent('cartavault:show-media-upload', {
      detail: { maps: [{ id: 'map-1', name: 'France', country: { name: 'France' }, can_edit: true }] },
    }))
    expect(await screen.findByRole('dialog', { name: 'Importer des photos' })).toBeVisible()
    // The dialog is owned by this root host; it is not portalled into a panel.
    expect(container.querySelector('.media-upload-modal')).not.toBeNull()
  })
})
