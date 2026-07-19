import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { getPlaceListPosition, getPlaces } from '../../api/places'
import { MapPlaceList } from './MapPlaceList'

vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: true, index: 0, page: 0, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn() }))
vi.mock('../../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../api/trips', () => ({ getTrip: vi.fn(), listTrips: vi.fn(() => Promise.resolve([])) }))

describe('MapPlaceList', () => {
  it('filters by the selected map UUID', async () => {
    render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-id' }), expect.any(AbortSignal)))
    expect(screen.getByText('France')).toBeVisible()
  })

  it('renders map information and filters alongside each POI', async () => {
    const place = { id: 'place-id', name: 'Manufacture', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [{ id: 'category-id', name: 'Église', icon: 'mdi:church', is_primary: true }], tags: [{ id: 'tag-id', name: 'Patrimoine' }] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    const select = vi.fn()
    const { container } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId="place-id" refreshVersion={0} removedPlaceId={null} onPlaceSelect={select} /></MemoryRouter>)
    const item = await screen.findByRole('button', { name: /Manufacture/ })
    expect(item).toHaveClass('selected')
    expect(screen.getByText('1 POI')).toBeVisible()
    expect(container.querySelector('input[type="search"]')).toBeVisible()
    expect(container.querySelector('.place-list-filters button')).toBeVisible()
    expect(container.querySelector('.place-list-item-meta')).toHaveTextContent('À faire·Église')
    expect(container.querySelector('.place-list-tag')).toHaveTextContent('Patrimoine')
    expect(container.querySelector('.place-list-status-dot')).not.toBeInTheDocument()
    expect(container.querySelector('.place-list-category-bubble')).toHaveStyle({ backgroundColor: '#2563EB', borderColor: '#2563EB' })
    expect(container.querySelector('.place-list-category-bubble [data-category-icon-id="mdi:church"]')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Importer un fichier KMZ"]')).toBeVisible()
    fireEvent.click(item)
    expect(select).toHaveBeenCalledWith(place)
    expect(getPlaceListPosition).not.toHaveBeenCalled()
  })

  it('makes available POIs draggable only during trip planning', async () => {
    const place = { id: 'place-id', name: 'Étape', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    const { rerender } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} tripPlanningActive tripPlaceIds={new Set()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Étape/ })).toHaveAttribute('draggable', 'true')
    rerender(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} tripPlanningActive tripPlaceIds={new Set(['place-id'])} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Étape/ })).toHaveAttribute('draggable', 'false')
    expect(screen.getByText('Ajouté')).toBeVisible()
  })
})
