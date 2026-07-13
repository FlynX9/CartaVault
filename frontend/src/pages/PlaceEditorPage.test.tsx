import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createPlace, getPlaceDetails, updatePlace } from '../api/places'
import type { PlaceFormValues } from '../types/place'
import { PlaceEditorPage } from './PlaceEditorPage'
vi.mock('../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) })); vi.mock('../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) })); vi.mock('../api/places', () => ({ getPlaceDetails: vi.fn(), createPlace: vi.fn(), updatePlace: vi.fn(), addPlaceCategory: vi.fn(), removePlaceCategory: vi.fn(), addPlaceTag: vi.fn(), removePlaceTag: vi.fn() }))
vi.mock('../components/places/PlaceForm', () => ({ PlaceForm: ({ initialValues, onSubmit }: { initialValues: PlaceFormValues; onSubmit: (values: PlaceFormValues) => Promise<void> }) => <><output data-testid="initial-map">{initialValues.mapId}</output><button onClick={() => void onSubmit({ ...initialValues, name: 'POI', latitude: '48', longitude: '2' })}>Envoyer</button><button onClick={() => void onSubmit({ ...initialValues, mapId: 'map-b' })}>Déplacer</button></> }))
const COUNTRY = { id: 'country', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }; const MAP_A = { id: 'map-a', name: 'A', country: COUNTRY } as never; const MAP_B = { id: 'map-b', name: 'B', country: COUNTRY } as never
const PLACE = { id: 'place-id', name: 'POI', map_id: 'map-a', map: { id: 'map-a', name: 'A', country: COUNTRY }, description: null, region: null, construction_date: null, abandonment_date: null, condition: null, access: null, danger_level: null, latitude: 48, longitude: 2, categories: [], tags: [], created_at: '2026-01-01', updated_at: '2026-01-01' }
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('PlaceEditorPage maps', () => {
  it('creates with the active map', async () => { vi.mocked(createPlace).mockResolvedValue(PLACE); render(<MemoryRouter><PlaceEditorPage mode="create" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>); expect(await screen.findByTestId('initial-map')).toHaveTextContent('map-a'); fireEvent.click(screen.getByText('Envoyer')); await waitFor(() => expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({ map_id: 'map-a' }))) })
  it('moves an existing POI using a minimal map_id PATCH', async () => { vi.mocked(getPlaceDetails).mockResolvedValue(PLACE); vi.mocked(updatePlace).mockResolvedValue({ ...PLACE, map_id: 'map-b' }); render(<MemoryRouter><PlaceEditorPage mode="edit" placeId="place-id" activeMapId="map-a" maps={[MAP_A, MAP_B]} onPlaceMutated={vi.fn()} /></MemoryRouter>); fireEvent.click(await screen.findByText('Déplacer')); await waitFor(() => expect(updatePlace).toHaveBeenCalledWith('place-id', { map_id: 'map-b' })) })
})
