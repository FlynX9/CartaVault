import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getPlaces } from '../../api/places'
import { MapPlaceList } from './MapPlaceList'
vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])) }))
describe('MapPlaceList', () => { it('filters by the selected map UUID', async () => { render(<MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} />); await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-id' }), expect.any(AbortSignal))); expect(screen.getByText('France')).toBeVisible() }) })
