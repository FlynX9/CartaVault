import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { createPlace, getPlaceDetails, updatePlace } from '../api/places'
import type { PlaceDetails, PlaceFormValues } from '../types/place'
import { PlaceEditorPage } from './PlaceEditorPage'

vi.mock('../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/places', () => ({
  getPlaceDetails: vi.fn(),
  createPlace: vi.fn(),
  updatePlace: vi.fn(),
  addPlaceCategory: vi.fn(),
  removePlaceCategory: vi.fn(),
  addPlaceTag: vi.fn(),
  removePlaceTag: vi.fn(),
}))
vi.mock('../components/places/PlaceForm', () => ({
  PlaceForm: ({ initialValues, onSubmit }: { initialValues: PlaceFormValues; onSubmit: (values: PlaceFormValues) => Promise<void> }) => (
    <button type="button" onClick={() => void onSubmit({ ...initialValues, name: initialValues.name ? `${initialValues.name} modifié` : 'POI créé', latitude: '48.17', longitude: '6.45' })}>
      Envoyer le formulaire
    </button>
  ),
}))

const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const PLACE: PlaceDetails = {
  id: PLACE_ID,
  name: 'Manufacture',
  description: null,
  country: null,
  region: null,
  construction_date: null,
  abandonment_date: null,
  condition: null,
  access: null,
  danger_level: null,
  latitude: 48.17,
  longitude: 6.45,
  categories: [],
  tags: [],
  created_at: '2026-07-13T10:00:00',
  updated_at: '2026-07-13T10:00:00',
}

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>
}

beforeEach(() => {
  vi.mocked(getPlaceDetails).mockResolvedValue(PLACE)
  vi.mocked(createPlace).mockResolvedValue({ ...PLACE, name: 'POI créé' })
  vi.mocked(updatePlace).mockResolvedValue({ ...PLACE, name: 'Manufacture modifié' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PlaceEditorPage sidebar navigation', () => {
  it('opens the created place details after success', async () => {
    const onPlaceMutated = vi.fn()
    render(<MemoryRouter initialEntries={['/places/new']}><PlaceEditorPage mode="create" embedded onPlaceMutated={onPlaceMutated} /><CurrentPath /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le formulaire' }))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/places/${PLACE_ID}`))
    expect(onPlaceMutated).toHaveBeenCalled()
  })

  it('returns to details after an edit and refreshes markers', async () => {
    const onPlaceMutated = vi.fn()
    render(<MemoryRouter initialEntries={[`/places/${PLACE_ID}/edit`]}><PlaceEditorPage mode="edit" placeId={PLACE_ID} embedded onPlaceMutated={onPlaceMutated} /><CurrentPath /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le formulaire' }))
    await waitFor(() => expect(updatePlace).toHaveBeenCalledWith(PLACE_ID, { name: 'Manufacture modifié' }))
    expect(screen.getByTestId('path')).toHaveTextContent(`/places/${PLACE_ID}`)
    expect(onPlaceMutated).toHaveBeenCalled()
  })
})
