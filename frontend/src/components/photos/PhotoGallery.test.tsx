import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Photo } from '../../types/photo'
import { PhotoGallery } from './PhotoGallery'

vi.mock('../../api/photos', () => ({
  getPhotoFileUrl: (photoId: string) => `/photos/${photoId}/file`,
}))

afterEach(cleanup)

describe('PhotoGallery', () => {
  it('opens the selected secondary photo in the full-screen viewer', () => {
    const photos: Photo[] = [
      { id: 'main', place_id: 'place', filename: 'main.jpg', original_name: null, path: 'private/main', description: 'Principale', taken_at: null, created_at: null, sort_order: 0, is_primary: true },
      { id: 'secondary', place_id: 'place', filename: 'secondary.jpg', original_name: null, path: 'private/secondary', description: 'Détail', taken_at: null, created_at: null, sort_order: 1, is_primary: false },
    ]

    render(<PhotoGallery placeName="Manufacture" photos={photos} isLoading={false} errorMessage={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Détail/ }))

    expect(screen.getByRole('dialog', { name: 'Manufacture' })).toBeVisible()
    expect(screen.getByText(/Photo 2 (of|sur) 2/)).toBeVisible()
    expect(screen.getAllByRole('img', { name: 'Détail' }).at(-1)).toHaveAttribute('src', '/photos/secondary/file')
  })

  it('does not offer a viewer action without photos', () => {
    render(<PhotoGallery placeName="Manufacture" photos={[]} isLoading={false} errorMessage={null} />)
    expect(screen.getByText('Aucune photo pour ce POI.')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
