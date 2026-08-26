import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { getCategories } from '../api/categories'
import { ApiError } from '../api/client'
import { createPlace, getPlaceDetails, movePlace, replacePlaceLinks } from '../api/places'
import type { PlaceFormValues } from '../types/place'
import { PlaceEditorPage } from './PlaceEditorPage'
vi.mock('../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) })); vi.mock('../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) })); vi.mock('../api/statuses', () => ({ getStatuses: vi.fn(() => Promise.resolve([{ id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, is_default: true }])) })); vi.mock('../api/places', () => ({ getPlaceDetails: vi.fn(), createPlace: vi.fn(), updatePlace: vi.fn(), movePlace: vi.fn(), replacePlaceLinks: vi.fn(() => Promise.resolve([])), refreshPlaceRegion: vi.fn(), addPlaceCategory: vi.fn(), removePlaceCategory: vi.fn(), addPlaceTag: vi.fn(), removePlaceTag: vi.fn() }))
vi.mock('../components/places/PlaceForm', () => ({ PlaceForm: ({ initialValues, onSubmit, onDirtyChange }: { initialValues: PlaceFormValues; onSubmit: (values: PlaceFormValues) => Promise<void>; onDirtyChange?: (dirty: boolean) => void }) => {
  const [name, setName] = useState(initialValues.name)
  useEffect(() => { onDirtyChange?.(name !== initialValues.name) }, [initialValues.name, name, onDirtyChange])
  return <><output data-testid="initial-map">{initialValues.mapId}</output><label>Nom<input aria-label="Nom" value={name} onChange={(event) => setName(event.target.value)} /></label><button onClick={() => void onSubmit({ ...initialValues, name: 'POI', latitude: '48', longitude: '2' })}>Envoyer</button><button onClick={() => void onSubmit({ ...initialValues, mapId: 'map-b' })}>Déplacer</button><button onClick={() => void onSubmit({ ...initialValues, name: 'POI', latitude: '48', longitude: '2', links: [{ clientId: 'new-link', label: 'Site officiel', url: 'https://example.org' }] })}>Ajouter un lien</button></>
} }))
vi.mock('../components/places/MovePlaceDialog', () => ({ MovePlaceDialog: ({ onMove }: { onMove: (mapId: string, statusId: string) => Promise<void> }) => <button onClick={() => void onMove('map-b', 'status-b')}>Confirmer le déplacement</button> }))
const COUNTRY = { id: 'country', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }; const MAP_A = { id: 'map-a', name: 'A', country: COUNTRY } as never; const MAP_B = { id: 'map-b', name: 'B', country: COUNTRY } as never
const PLACE = { id: 'place-id', name: 'POI', map_id: 'map-a', map: { id: 'map-a', name: 'A', country: COUNTRY }, status: { id: 'status-id', map_id: 'map-a', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const }, description: null, region: null, construction_date: null, abandonment_date: null, condition: null, access: null, danger_level: null, latitude: 48, longitude: 2, categories: [], tags: [], created_at: '2026-01-01', updated_at: '2026-01-01' }
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('PlaceEditorPage maps', () => {
  it('opens an edit form while category loading is still pending', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue(PLACE)
    vi.mocked(getCategories).mockImplementationOnce(() => new Promise(() => undefined))

    const { unmount } = render(<MemoryRouter><PlaceEditorPage mode="edit" placeId="place-id" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByTestId('initial-map')).toHaveTextContent('map-a')
    expect(screen.queryByText('Chargement du formulaire…')).not.toBeInTheDocument()
    unmount()
  })

  it('creates with the active map', async () => { vi.mocked(createPlace).mockResolvedValue(PLACE); render(<MemoryRouter><PlaceEditorPage mode="create" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>); expect(await screen.findByTestId('initial-map')).toHaveTextContent('map-a'); fireEvent.click(screen.getByText('Envoyer')); await waitFor(() => expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({ map_id: 'map-a' }))) })
  it('persists named links immediately after creating the POI', async () => {
    vi.mocked(createPlace).mockResolvedValue(PLACE)
    render(<MemoryRouter><PlaceEditorPage mode="create" activeMapId="map-a" maps={[MAP_A]} onPlaceMutated={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByText('Ajouter un lien'))
    await waitFor(() => expect(replacePlaceLinks).toHaveBeenCalledWith('place-id', [{ id: undefined, label: 'Site officiel', url: 'https://example.org', sort_order: 0 }]))
  })
  it('asks for confirmation then retries an out-of-country creation explicitly', async () => {
    vi.mocked(createPlace)
      .mockRejectedValueOnce(new ApiError(409, 'Ces coordonnées semblent situées hors de France.', {}, 'PLACE_OUTSIDE_MAP_COUNTRY'))
      .mockResolvedValueOnce(PLACE)
    render(<MemoryRouter><PlaceEditorPage mode="create" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>)

    fireEvent.click(await screen.findByText('Envoyer'))
    expect(await screen.findByRole('heading', { name: 'POI hors du pays de la carte' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer quand même' }))

    await waitFor(() => expect(createPlace).toHaveBeenCalledTimes(2))
    expect(createPlace).toHaveBeenLastCalledWith(expect.objectContaining({
      map_id: 'map-a',
      confirm_outside_country: true,
    }))
  })
  it('moves an existing POI through the explicit move operation', async () => { vi.mocked(getPlaceDetails).mockResolvedValue(PLACE); vi.mocked(movePlace).mockResolvedValue({ ...PLACE, map_id: 'map-b', status: { ...PLACE.status, id: 'status-b', map_id: 'map-b' } }); render(<MemoryRouter><PlaceEditorPage mode="edit" placeId="place-id" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>); fireEvent.click(await screen.findByText('Déplacer vers une autre carte')); fireEvent.click(await screen.findByText('Confirmer le déplacement')); await waitFor(() => expect(movePlace).toHaveBeenCalledWith('place-id', { target_map_id: 'map-b', target_status_id: 'status-b' })) })
  it('discards a dirty POI draft only after confirmation before opening Move', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue(PLACE)
    render(<MemoryRouter><PlaceEditorPage mode="edit" placeId="place-id" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>)

    const name = await screen.findByRole('textbox', { name: 'Nom' })
    fireEvent.change(name, { target: { value: 'Brouillon' } })
    fireEvent.click(screen.getByText('Déplacer vers une autre carte'))

    expect(screen.queryByText('Confirmer le déplacement')).not.toBeInTheDocument()
    expect(name).toHaveValue('Brouillon')
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer l’édition' }))
    expect(screen.queryByText('Confirmer le déplacement')).not.toBeInTheDocument()
    expect(name).toHaveValue('Brouillon')

    fireEvent.click(screen.getByText('Déplacer vers une autre carte'))
    fireEvent.click(await screen.findByRole('button', { name: 'Quitter sans enregistrer' }))
    expect(await screen.findByText('Confirmer le déplacement')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveValue('POI')
    expect(movePlace).not.toHaveBeenCalled()
  })
})
