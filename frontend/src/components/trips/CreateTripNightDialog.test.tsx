import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPlaceDetails } from '../../api/places'
import { geocodingService } from '../../geocoding/geocodingService'
import { CreateTripNightDialog } from './CreateTripNightDialog'

vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn() }))
vi.mock('../../geocoding/geocodingService', () => ({ geocodingService: { search: vi.fn() } }))

describe('CreateTripNightDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('selects an address or GPS result and creates a free night location', async () => {
    vi.mocked(geocodingService.search).mockResolvedValue([{ id: 'geo-1', name: 'Hôtel Central', formattedAddress: '1 rue Centrale, Namur', latitude: 50.4669, longitude: 4.8675, source: 'test' }])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" mapName="Belgique" focus={[50.5, 4.8]} countryCode="BE" onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Adresse ou coordonnées GPS'), { target: { value: 'Namur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Hôtel Central/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ previous_day_id: 'day-1', next_day_id: 'day-2', name: 'Hôtel Central', latitude: 50.4669, longitude: 4.8675, address: '1 rue Centrale, Namur' })))
    expect(geocodingService.search).toHaveBeenCalledWith('Namur', expect.objectContaining({ countryCode: 'BE', focus: [50.5, 4.8] }))
  })

  it('accepts a POI supplied by drag and drop', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'place-1', name: 'Gîte du Lac', latitude: 50.2, longitude: 4.4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" focus={[50, 4]} onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.drop(document.querySelector('.trip-night-drop')!, { dataTransfer: { getData: () => 'place:place-1' } })
    expect(await screen.findByText('Gîte du Lac')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'place-1' })))
  })

  it('creates the departure without night day identifiers', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'place-home', name: 'Maison', latitude: 50.2, longitude: 4.4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog kind="departure" initialPlaceId="place-home" focus={[50, 4]} onClose={vi.fn()} onCreate={onCreate} />)
    expect(await screen.findByText('Maison')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le départ' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ place_id: 'place-home' })))
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('previous_day_id')
  })

  it('creates a free day stop through the shared geographic dialog', async () => {
    vi.mocked(geocodingService.search).mockResolvedValue([{ id: 'geo-stop', name: 'Point de vue', formattedAddress: 'Col du Test', latitude: 44.1, longitude: 6.2, source: 'test' }])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog kind="stop" mapName="France" focus={[44, 6]} onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Adresse ou coordonnées GPS'), { target: { value: 'Col du Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Point de vue/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’étape' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ stop_type: 'free_location', name: 'Point de vue', latitude: 44.1, longitude: 6.2, visit_duration_minutes: 30 })))
  })
})
