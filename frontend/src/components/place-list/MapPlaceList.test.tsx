import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getPlaces } from '../../api/places'
import { MapPlaceList } from './MapPlaceList'
vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])) }))
describe('MapPlaceList', () => {
  it('filters by the selected map UUID', async () => { render(<MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} />); await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-id' }), expect.any(AbortSignal))); expect(screen.getByText('France')).toBeVisible() })
  it('opens a list item and reflects marker selection', async () => { const place = { id: 'place-id', name: 'Manufacture', latitude: 48, longitude: 2, categories: [], tags: [] } as never; vi.mocked(getPlaces).mockResolvedValue([place]); const select = vi.fn(); render(<MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId="place-id" refreshVersion={0} removedPlaceId={null} onPlaceSelect={select} />); const item = await screen.findByRole('button', { name: 'Manufacture' }); expect(item).toHaveClass('selected'); fireEvent.click(item); expect(select).toHaveBeenCalledWith(place) })
})
