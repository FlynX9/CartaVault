import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { getPlaces } from '../../api/places'
import { MapPlaceList } from './MapPlaceList'

vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])) }))

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
    expect(container.querySelector('[aria-label="Filtrer par catégorie"]')).toBeVisible()
    expect(container.querySelector('[aria-label="Filtrer par statut"]')).toBeVisible()
    expect(container.querySelector('[aria-label="Filtrer par tag"]')).toBeVisible()
    expect(container.querySelector('.place-list-category-name')).toHaveTextContent('Église')
    expect(container.querySelector('.place-list-tag')).toHaveTextContent('Patrimoine')
    expect(container.querySelector('.place-list-status-dot')).toHaveStyle({ backgroundColor: '#2563EB' })
    expect(container.querySelector('.place-list-category-bubble [data-category-icon-id="mdi:church"]')).toBeInTheDocument()
    fireEvent.click(item)
    expect(select).toHaveBeenCalledWith(place)
  })
})
