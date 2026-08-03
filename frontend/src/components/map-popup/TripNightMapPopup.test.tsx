import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteTripNightPhoto, updateTripNight, uploadTripNightPhoto } from '../../api/trips'
import type { TripNight } from '../../types/trip'
import { TripNightMapPopup } from './TripNightMapPopup'

vi.mock('../../api/trips', () => ({
  deleteTripNightPhoto: vi.fn(),
  tripNightPhotoUrl: (id: string, photoId: string) => `/trip-nights/${id}/photos/${photoId}`,
  updateTripNight: vi.fn(),
  uploadTripNightPhoto: vi.fn(),
}))

const night: TripNight = { id: 'night-1', trip_id: 'trip-1', previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map', name: 'Hôtel', latitude: 48, longitude: 2, address: '1 rue du Test', google_place_id: null, description: null, photo_id: null, notes: null, check_in_time: null, check_out_time: null }

describe('TripNightMapPopup', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('edits the private description and uploads a night photo', async () => {
    const onUpdated = vi.fn()
    vi.mocked(updateTripNight).mockResolvedValue({ ...night, description: 'Vue sur le jardin' })
    vi.mocked(uploadTripNightPhoto).mockResolvedValue({ ...night, photo_id: 'photo-1' })
    const { container } = render(<TripNightMapPopup night={night} canEdit onUpdated={onUpdated} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Vue sur le jardin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateTripNight).toHaveBeenCalledWith('night-1', expect.objectContaining({ description: 'Vue sur le jardin' })))

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['photo'], 'hotel.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(uploadTripNightPhoto).toHaveBeenCalledWith('night-1', expect.any(File)))
    expect(onUpdated).toHaveBeenCalledTimes(2)
  })

  it('renders the stored night photo without exposing it as a media item', () => {
    const { container } = render(<TripNightMapPopup night={{ ...night, photo_id: 'photo-1', photos: [{ id: 'photo-1', sort_order: 0 }] }} canEdit={false} onUpdated={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Photo 1 de Hôtel' })).toHaveAttribute('src', '/trip-nights/night-1/photos/photo-1')
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('edits a clickable website and both arrival and departure ranges', async () => {
    const onUpdated = vi.fn()
    const detailedNight = { ...night, website_url: 'https://hotel.example', check_in_from_time: '14:00:00', check_in_until_time: '23:30:00', check_out_from_time: '08:00:00', check_out_until_time: '11:00:00' }
    vi.mocked(updateTripNight).mockResolvedValue(detailedNight)
    render(<TripNightMapPopup night={detailedNight} canEdit onUpdated={onUpdated} onClose={vi.fn()} />)

    expect(screen.getByRole('link', { name: /hotel\.example/i })).toHaveAttribute('href', 'https://hotel.example')
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le site web' }))
    fireEvent.change(screen.getByLabelText('Adresse du site web'), { target: { value: 'booking.example/hotel' } })
    const arrival = screen.getByRole('group', { name: 'Arrivée' })
    const departure = screen.getByRole('group', { name: 'Départ' })
    fireEvent.change(within(arrival).getByLabelText('À partir de'), { target: { value: '15:00' } })
    fireEvent.change(within(departure).getByLabelText('Jusqu’à'), { target: { value: '12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateTripNight).toHaveBeenCalledWith('night-1', expect.objectContaining({
      website_url: 'https://booking.example/hotel',
      check_in_from_time: '15:00',
      check_in_until_time: '23:30',
      check_out_from_time: '08:00',
      check_out_until_time: '12:00',
    })))
  })

  it('navigates, enlarges and deletes individual night photos', async () => {
    const onUpdated = vi.fn()
    const galleryNight = { ...night, photo_id: 'photo-1', photos: [{ id: 'photo-1', sort_order: 0 }, { id: 'photo-2', sort_order: 1 }] }
    vi.mocked(deleteTripNightPhoto).mockResolvedValue({ ...galleryNight, photo_id: 'photo-2', photos: [{ id: 'photo-2', sort_order: 0 }] })
    render(<TripNightMapPopup night={galleryNight} canEdit onUpdated={onUpdated} onClose={vi.fn()} />)

    expect(screen.getByText('1 / 2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Photo suivante' }))
    expect(screen.getByRole('img', { name: 'Photo 2 de Hôtel' })).toHaveAttribute('src', '/trip-nights/night-1/photos/photo-2')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('img', { name: 'Photo 1 de Hôtel' })).toHaveAttribute('src', '/trip-nights/night-1/photos/photo-1')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('img', { name: 'Photo 2 de Hôtel' })).toHaveAttribute('src', '/trip-nights/night-1/photos/photo-2')

    fireEvent.click(screen.getByRole('button', { name: 'Afficher la photo 2 sur 2 en grand' }))
    expect(screen.getByRole('dialog', { name: 'Photo 2 de Hôtel' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la photo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la photo 2' }))
    await waitFor(() => expect(deleteTripNightPhoto).toHaveBeenCalledWith('night-1', 'photo-2'))
    expect(onUpdated).toHaveBeenCalled()
  })

  it('uploads a clipboard screenshot from the opened night popup', async () => {
    const onUpdated = vi.fn()
    const pastedNight = { ...night, photo_id: 'clipboard-photo' }
    const screenshot = new File(['capture'], 'capture.png', { type: 'image/png' })
    vi.mocked(uploadTripNightPhoto).mockResolvedValue(pastedNight)

    const { container } = render(<TripNightMapPopup night={night} canEdit onUpdated={onUpdated} onClose={vi.fn()} />)
    fireEvent.click(container.querySelector('.trip-night-map-popup')!)
    fireEvent.paste(window, { clipboardData: { files: [screenshot], items: [] } })

    await waitFor(() => expect(uploadTripNightPhoto).toHaveBeenCalledWith('night-1', screenshot))
    expect(onUpdated).toHaveBeenCalledWith(pastedNight)
    expect(screen.getByRole('status')).toHaveTextContent('Capture ajoutée à cette nuit.')
  })

  it('limits hover-only actions to the night photo gallery', () => {
    render(<TripNightMapPopup night={{ ...night, google_place_id: 'google-place-1', photo_id: 'photo-1', photos: [{ id: 'photo-1', sort_order: 0 }] }} canEdit onUpdated={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Supprimer la photo 1' })).toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('button', { name: 'Afficher la photo 1 sur 1 en grand' })).not.toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('button', { name: 'Fermer la fiche de la nuit' })).not.toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('button', { name: 'Modifier le site web' })).not.toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('button', { name: 'Ajouter des photos' })).not.toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).not.toHaveClass('trip-night-hover-action')
    expect(screen.getByRole('link', { name: 'Google Maps' })).not.toHaveClass('trip-night-hover-action')
  })

  it('reuses the POI popup skeleton with night-specific fields', () => {
    const { container } = render(<TripNightMapPopup night={night} canEdit onUpdated={vi.fn()} onClose={vi.fn()} />)

    expect(container.querySelector('.popup-hero .popup-gallery')).toBeInTheDocument()
    expect(container.querySelector('.popup-hero .popup-overview')).toBeInTheDocument()
    expect(container.querySelector('.popup-description')).toBeInTheDocument()
    expect(container.querySelector('.popup-summary')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Arrivée' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Départ' })).toBeInTheDocument()
  })

  it('does not intercept clipboard images on a read-only night popup', () => {
    const screenshot = new File(['capture'], 'capture.png', { type: 'image/png' })
    render(<TripNightMapPopup night={night} canEdit={false} onUpdated={vi.fn()} onClose={vi.fn()} />)

    fireEvent.paste(window, { clipboardData: { files: [screenshot], items: [] } })

    expect(uploadTripNightPhoto).not.toHaveBeenCalled()
  })
})
