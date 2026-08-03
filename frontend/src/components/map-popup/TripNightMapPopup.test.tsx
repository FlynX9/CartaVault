import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateTripNight, uploadTripNightPhoto } from '../../api/trips'
import type { TripNight } from '../../types/trip'
import { TripNightMapPopup } from './TripNightMapPopup'

vi.mock('../../api/trips', () => ({
  deleteTripNightPhoto: vi.fn(),
  tripNightPhotoUrl: (id: string, photoId: string) => `/trip-nights/${id}/photo?v=${photoId}`,
  updateTripNight: vi.fn(),
  uploadTripNightPhoto: vi.fn(),
}))

const night: TripNight = { id: 'night-1', trip_id: 'trip-1', previous_day_id: 'day-1', next_day_id: 'day-2', place_id: null, source_type: 'map', name: 'Hôtel', latitude: 48, longitude: 2, address: '1 rue du Test', google_place_id: null, description: null, photo_id: null, notes: null, check_in_time: null, check_out_time: null }

describe('TripNightMapPopup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('edits the private description and uploads a night photo', async () => {
    const onUpdated = vi.fn()
    vi.mocked(updateTripNight).mockResolvedValue({ ...night, description: 'Vue sur le jardin' })
    vi.mocked(uploadTripNightPhoto).mockResolvedValue({ ...night, photo_id: 'photo-1' })
    const { container } = render(<TripNightMapPopup night={night} canEdit onUpdated={onUpdated} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Vue sur le jardin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateTripNight).toHaveBeenCalledWith('night-1', { description: 'Vue sur le jardin' }))

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['photo'], 'hotel.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(uploadTripNightPhoto).toHaveBeenCalledWith('night-1', expect.any(File)))
    expect(onUpdated).toHaveBeenCalledTimes(2)
  })

  it('renders the stored night photo without exposing it as a media item', () => {
    const { container } = render(<TripNightMapPopup night={{ ...night, photo_id: 'photo-1' }} canEdit={false} onUpdated={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Photo de Hôtel' })).toHaveAttribute('src', '/trip-nights/night-1/photo?v=photo-1')
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })
})
