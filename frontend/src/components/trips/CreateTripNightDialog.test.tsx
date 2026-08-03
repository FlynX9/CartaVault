import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getPlaceDetails, getPlaces } from '../../api/places'
import { placeSearchService } from '../../geocoding/placeSearchService'
import { CreateTripNightDialog } from './CreateTripNightDialog'

vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn(), getPlaces: vi.fn() }))
vi.mock('../../geocoding/placeSearchService', () => ({ placeSearchService: { search: vi.fn() } }))

describe('CreateTripNightDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getPlaces).mockResolvedValue([])
    vi.mocked(placeSearchService.search).mockResolvedValue([])
  })
  afterEach(cleanup)

  it('selects an address or GPS result and creates a free night location', async () => {
    vi.mocked(placeSearchService.search).mockResolvedValue([{ id: 'geo-1', name: 'Hôtel Central', formattedAddress: '1 rue Centrale, Namur', latitude: 50.4669, longitude: 4.8675, source: 'test' }])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" mapName="Belgique" focus={[50.5, 4.8]} countryCode="BE" onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Adresse ou coordonnées GPS'), { target: { value: 'Namur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Hôtel Central/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ previous_day_id: 'day-1', next_day_id: 'day-2', source_type: 'map', name: 'Hôtel Central', latitude: 50.4669, longitude: 4.8675, address: '1 rue Centrale, Namur' })))
    expect(placeSearchService.search).toHaveBeenCalledWith('Namur', expect.objectContaining({ countryCode: 'BE', focus: [50.5, 4.8] }))
  })

  it('accepts a POI supplied by drag and drop', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ id: 'place-1', name: 'Gîte du Lac', latitude: 50.2, longitude: 4.4, map: { id: 'map-1', name: 'Belgique', country: {} } } as never)
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" focus={[50, 4]} onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.drop(document.querySelector('.trip-night-drop')!, { dataTransfer: { getData: () => 'place:place-1' } })
    expect(await screen.findByText('Gîte du Lac')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ previous_day_id: 'day-1', next_day_id: 'day-2', place_id: 'place-1', source_type: 'place' })))
  })

  it('extracts a pasted reservation with GPS coordinates for a night', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" focus={[50, 4]} onClose={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Texte de confirmation de réservation'), { target: { value: 'Hôtel des Alpes\n12 rue du Lac, Annecy\nLatitude: 45.8992, Longitude: 6.1294' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le texte' }))
    expect(await screen.findByText('Hôtel des Alpes')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      source_type: 'imported_text',
      name: 'Hôtel des Alpes',
      address: '12 rue du Lac, Annecy',
      latitude: 45.8992,
      longitude: 6.1294,
      notes: 'Hôtel des Alpes\n12 rue du Lac, Annecy\nLatitude: 45.8992, Longitude: 6.1294',
    })))
  })

  it('extracts the hotel, address and latest check-in and check-out times from a Booking confirmation', async () => {
    const reservation = [
      '**Votre séjour est** **confirmé**',
      'Votre confirmation a bien été envoyée à l’adresse gregory.rivolet@proton.me.',
      '[**Panorama Boutique Hotel**](https://www.booking.com/hotel/ge/panorama-boutique-tbilisi.fr.html)',
      'Panorama Boutique Hotel',
      '**Arrivée**',
      '**mar. 1er sept. 2026**',
      '14:00 - 00:00',
      '**Départ**',
      '**ven. 4 sept. 2026**',
      '09:00 - 14:00',
      '**Détails de la réservation**',
      '2 adultes - 3 nuits, 1 chambre',
      '**Adresse**',
      '13 Samreklo Street, 0103 Tbilissi, Géorgie',
      '**Voir l’itinéraire**',
    ].join('\n')
    vi.mocked(placeSearchService.search).mockResolvedValue([{ id: 'google:panorama', name: 'Panorama Boutique Hotel', formattedAddress: '13 Samreklo Street, 0103 Tbilissi, Géorgie', latitude: 41.697122, longitude: 44.8135, countryCode: 'GE', postalCode: '0103', locality: 'Tbilissi', confidence: 1, source: 'google_places' }])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" countryCode="GE" focus={[41.7, 44.8]} onClose={vi.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Texte de confirmation de réservation'), { target: { value: reservation } })
    fireEvent.click(screen.getByRole('button', { name: 'Analyser le texte' }))

    expect(await screen.findByText('Panorama Boutique Hotel')).toBeVisible()
    expect(placeSearchService.search).toHaveBeenCalledWith('Panorama Boutique Hotel, 13 Samreklo Street, 0103 Tbilissi, Géorgie', { countryCode: 'GE', limit: 10 })
    expect(screen.getByLabelText('Arrivée')).toHaveValue('00:00')
    expect(screen.getByLabelText('Départ')).toHaveValue('14:00')

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Panorama Boutique Hotel',
      address: '13 Samreklo Street, 0103 Tbilissi, Géorgie',
      latitude: 41.697122,
      longitude: 44.8135,
      check_in_time: '00:00',
      check_out_time: '14:00',
      notes: reservation,
    })))
  })

  it('includes CartaVault POIs when searching for a night location', async () => {
    vi.mocked(placeSearchService.search).mockResolvedValue([])
    vi.mocked(getPlaces).mockResolvedValue([{
      id: 'hotel-1', map_id: 'map-1', name: 'Hôtel CartaVault', latitude: 44.2, longitude: 6.3, region: 'Provence',
      map: { id: 'map-1', name: 'France', country: {} },
    } as never])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog mapId="map-1" previousDayId="day-1" nextDayId="day-2" focus={[44, 6]} onClose={vi.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Adresse ou coordonnées GPS'), { target: { value: 'Hôtel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Hôtel CartaVault/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la nuit' }))

    expect(getPlaces).toHaveBeenCalledWith({ mapId: 'map-1', q: 'Hôtel', limit: 6 }, expect.any(AbortSignal))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ place_id: 'hotel-1', source_type: 'place' })))
  })

  it('prioritizes an official Google establishment and rejects unrelated address matches', async () => {
    vi.mocked(placeSearchService.search).mockResolvedValue([
      { id: 'google:panorama', name: 'Panorama Boutique Hotel', formattedAddress: '13 Samreklo Street, 0103 Tbilissi, Géorgie', latitude: 41.697122, longitude: 44.8135, countryCode: 'GE', source: 'google_places' },
    ])
    render(<CreateTripNightDialog previousDayId="day-1" nextDayId="day-2" countryCode="GE" focus={[41.7, 44.8]} onClose={vi.fn()} onCreate={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Adresse ou coordonnées GPS'), { target: { value: '13 Samreklo Street, 0103 Tbilissi, Géorgie' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))

    expect(await screen.findByRole('option', { name: /Panorama Boutique Hotel/ })).toHaveTextContent('Google')
    expect(screen.queryByRole('option', { name: /Kakhétie/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Other Street/ })).not.toBeInTheDocument()
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
    vi.mocked(placeSearchService.search).mockResolvedValue([{ id: 'geo-stop', name: 'Point de vue', formattedAddress: 'Col du Test', latitude: 44.1, longitude: 6.2, source: 'test' }])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog kind="stop" mapId="map-1" mapName="France" focus={[44, 6]} onClose={vi.fn()} onCreate={onCreate} />)
    expect(screen.queryByText('Type d’étape')).not.toBeInTheDocument()
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(document.querySelector('.trip-night-drop')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Adresse, coordonnées GPS ou POI'), { target: { value: 'Col du Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Point de vue/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’étape' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ stop_type: 'free_location', name: 'Point de vue', latitude: 44.1, longitude: 6.2, visit_duration_minutes: 30 })))
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('notes')
  })

  it('includes map POIs in the free-stop search and selects one directly', async () => {
    vi.mocked(placeSearchService.search).mockResolvedValue([])
    vi.mocked(getPlaces).mockResolvedValue([{
      id: 'place-1', map_id: 'map-1', name: 'Musée CartaVault', latitude: 44.2, longitude: 6.3, region: 'Provence',
      map: { id: 'map-1', name: 'France', country: {} },
    } as never])
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateTripNightDialog kind="stop" mapId="map-1" mapName="France" focus={[44, 6]} onClose={vi.fn()} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Adresse, coordonnées GPS ou POI'), { target: { value: 'Musée' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.click(await screen.findByRole('option', { name: /Musée CartaVault/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’étape' }))

    expect(getPlaces).toHaveBeenCalledWith({ mapId: 'map-1', q: 'Musée', limit: 6 }, expect.any(AbortSignal))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ place_id: 'place-1', stop_type: 'free_location', visit_duration_minutes: 30 }))
  })
})
