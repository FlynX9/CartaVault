import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PendingPhotoPreviews } from './PhotoUploader'

describe('PendingPhotoPreviews', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders a ghost preview for every queued image and removes a queued item on demand', () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn((file: File) => `blob:${file.name}`), revokeObjectURL: vi.fn() })
    const onRemove = vi.fn()
    const files = [new File(['first'], 'premiere-photo.webp', { type: 'image/webp' }), new File(['second'], 'seconde-photo.webp', { type: 'image/webp' })]
    const { container } = render(<PendingPhotoPreviews files={files} onRemove={onRemove} />)
    expect(screen.getAllByText('En attente')).toHaveLength(2)
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:premiere-photo.webp')
    fireEvent.click(screen.getByRole('button', { name: 'Retirer seconde-photo.webp de l’envoi' }))
    expect(onRemove).toHaveBeenCalledWith(1)
  })
})
