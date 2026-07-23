import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Photo } from '../../types/photo'
import { PhotoViewer } from './PhotoViewer'

vi.mock('../../api/photos', () => ({
  getPhotoFileUrl: (photoId: string) => `/photos/${photoId}/file`,
}))

const photos: Photo[] = [
  {
    id: 'photo-main',
    place_id: 'place-id',
    filename: 'main.jpg',
    original_name: 'main-original.jpg',
    path: 'private/main.jpg',
    description: 'Façade principale',
    taken_at: '2026-07-14',
    created_at: null,
    sort_order: 1,
    is_primary: true,
  },
  {
    id: 'photo-second',
    place_id: 'place-id',
    filename: 'second.jpg',
    original_name: null,
    path: 'private/second.jpg',
    description: 'Cour intérieure',
    taken_at: null,
    created_at: null,
    sort_order: 2,
    is_primary: false,
  },
  {
    id: 'photo-third',
    place_id: 'place-id',
    filename: 'third.jpg',
    original_name: null,
    path: 'private/third.jpg',
    description: null,
    taken_at: null,
    created_at: null,
    sort_order: 3,
    is_primary: false,
  },
]

beforeEach(() => {
  vi.stubGlobal('Image', class {
    src = ''
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PhotoViewer', () => {
  it('shows one photo, exposes loading state and restores focus after Escape', () => {
    const close = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.append(trigger)
    trigger.focus()

    render(<PhotoViewer photos={[photos[0]]} placeName="Manufacture" onClose={close} />)

    expect(screen.getByRole('dialog', { name: 'Manufacture' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(/Loading photo|Chargement de la photo/)
    expect(screen.getByRole('button', { name: /Close photo viewer|Fermer la visionneuse/ })).toHaveFocus()
    const image = screen.getByRole('img', { name: 'Façade principale' })
    expect(image).toHaveAttribute('src', '/photos/photo-main/file')
    expect(screen.queryByRole('button', { name: /Previous photo|Photo précédente/ })).not.toBeInTheDocument()

    fireEvent.load(image)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()

    cleanup()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('opens the clicked secondary photo and supports bounded keyboard navigation', () => {
    render(<PhotoViewer photos={photos} placeName="Manufacture" initialPhotoId="photo-second" onClose={vi.fn()} />)

    expect(screen.getByText(/Photo 2 (of|sur) 3/)).toBeVisible()
    expect(screen.getByRole('img', { name: 'Cour intérieure' })).toBeVisible()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText(/Photo 3 (of|sur) 3/)).toBeVisible()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText(/Photo 3 (of|sur) 3/)).toBeVisible()
    fireEvent.keyDown(document, { key: 'Home' })
    expect(screen.getByText(/Photo 1 (of|sur) 3/)).toBeVisible()
    fireEvent.keyDown(document, { key: 'End' })
    expect(screen.getByText(/Photo 3 (of|sur) 3/)).toBeVisible()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(screen.getByText(/Photo 2 (of|sur) 3/)).toBeVisible()
  })

  it('keeps navigation available when one image fails and retries only that image', async () => {
    render(<PhotoViewer photos={photos} placeName="Manufacture" onClose={vi.fn()} />)
    const image = screen.getByRole('img', { name: 'Façade principale' })

    fireEvent.error(image)
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be displayed|ne peut pas être affichée/)
    fireEvent.click(screen.getByRole('button', { name: /Next photo|Photo suivante/ }))
    expect(screen.getByRole('img', { name: 'Cour intérieure' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Previous photo|Photo précédente/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Retry|Réessayer/ }))
    expect(screen.getByRole('img', { name: 'Façade principale' })).toBeVisible()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('changes photo with a horizontal swipe and traps focus inside the dialog', () => {
    render(<PhotoViewer photos={photos} placeName="Manufacture" onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog')

    fireEvent.touchStart(dialog.parentElement!, { changedTouches: [{ clientX: 220, clientY: 100 }] })
    fireEvent.touchEnd(dialog.parentElement!, { changedTouches: [{ clientX: 100, clientY: 105 }] })
    expect(screen.getByText(/Photo 2 (of|sur) 3/)).toBeVisible()

    const lastButton = screen.getByRole('button', { name: /Next photo|Photo suivante/ })
    lastButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: /Close photo viewer|Fermer la visionneuse/ })).toHaveFocus()
  })
})
