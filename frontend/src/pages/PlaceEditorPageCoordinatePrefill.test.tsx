import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { PlaceEditorPage } from './PlaceEditorPage'

vi.mock('../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/statuses', () => ({ getStatuses: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/places', () => ({
  addPlaceCategory: vi.fn(),
  addPlaceTag: vi.fn(),
  createPlace: vi.fn(),
  getPlaceDetails: vi.fn(),
  removePlaceCategory: vi.fn(),
  removePlaceTag: vi.fn(),
  setPrimaryPlaceCategory: vi.fn(),
  updatePlace: vi.fn(),
}))

describe('PlaceEditorPage coordinate prefill', () => {
  it('keeps the exact coordinates from the context menu without a geographic search result', async () => {
    render(
      <MemoryRouter>
        <PlaceEditorPage
          mode="create"
          activeMapId="map-id"
          maps={[]}
          coordinatePrefill={{ latitude: 48.1234567, longitude: -2.7654321 }}
          onPlaceMutated={vi.fn()}
        />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByLabelText('Latitude *')).toHaveValue(48.1234567))
    expect(screen.getByLabelText('Longitude *')).toHaveValue(-2.7654321)
  })
})
