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

  it('restricts a map-scoped upload to the current map', async () => {
    render(<MediaUploadHost />)
    window.dispatchEvent(new CustomEvent('cartavault:show-media-upload', {
      detail: {
        mapId: 'map-2',
        maps: [
          { id: 'map-1', name: 'France', country: { name: 'France' }, can_edit: true },
          { id: 'map-2', name: 'Italie', country: { name: 'Italie' }, can_edit: true },
        ],
      },
    }))
    const select = await screen.findByRole('combobox')
    expect(select).toHaveValue('map-2')
    expect(select.querySelectorAll('option')).toHaveLength(1)
  })
})
