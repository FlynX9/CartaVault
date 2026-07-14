import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getPlaces } from '../../api/places'
import { MapPlaceList } from './MapPlaceList'
vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])) }))
describe('MapPlaceList', () => {
  it('filters by the selected map UUID', async () => { render(<MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} />); await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-id' }), expect.any(AbortSignal))); expect(screen.getByText('France')).toBeVisible() })
  it('opens a list item and renders its Iconify primary category', async () => { const place = { id: 'place-id', name: 'Manufacture', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [{ id: 'category-id', name: 'Église', icon: 'mdi:church', is_primary: true }], tags: [] } as never; vi.mocked(getPlaces).mockResolvedValue([place]); const select = vi.fn(); const { container } = render(<MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId="place-id" refreshVersion={0} removedPlaceId={null} onPlaceSelect={select} />); const item = await screen.findByRole('button', { name: /Manufacture/ }); expect(item).toHaveClass('selected'); expect(item).toHaveTextContent('Église'); expect(container.querySelector('.place-list-item [data-category-icon-id="mdi:church"]')).toBeInTheDocument(); fireEvent.click(item); expect(select).toHaveBeenCalledWith(place) })
})
