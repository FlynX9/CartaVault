import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/categories', () => ({ getCategories: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/photos', () => ({ getPlacePhotos: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/places', () => ({ getPlaces: vi.fn().mockResolvedValue([]), getPlaceDetails: vi.fn() }))
vi.mock('../api/statuses', () => ({ getStatuses: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/tags', () => ({ getTags: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/trips', () => ({ getTrip: vi.fn() }))

import { clearOfflineDataForUser, defaultMapOfflineOptions, deleteOfflinePackage, downloadMapOfflinePackage, getOfflinePackage, listOfflinePackages, offlineMaps, setOfflineIdentity } from './offlineData'
import { getPlaces } from '../api/places'
import type { PoiMap } from '../types/map'
import type { PlaceDetails } from '../types/place'

const map = { id: 'map-1', name: 'France', updated_at: '2026-08-08T00:00:00Z' } as unknown as PoiMap
const place = { id: 'place-1', map_id: 'map-1', name: 'Lyon', latitude: 45.75, longitude: 4.85, status: { id: 'status-1', color: '#0FA68A' }, categories: [], tags: [], is_favorite: false } as unknown as PlaceDetails

describe('offline data packages', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase('cartavault-offline'); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve() })
    vi.mocked(getPlaces).mockResolvedValue([place])
  })

  it('stores a map package and never exposes it to another account', async () => {
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    const saved = await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    expect(saved.snapshot.places).toEqual([place])
    expect(await listOfflinePackages('user-a')).toHaveLength(1)
    expect(await getOfflinePackage('user-a', 'map', 'map-1')).not.toBeNull()
    expect(await offlineMaps()).toEqual([map])
    setOfflineIdentity({ id: 'user-b', email: 'b@example.test', display_name: 'B', is_admin: false })
    expect(await offlineMaps()).toEqual([])
  })

  it('deletes one package and clears all private data on logout', async () => {
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    const saved = await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    await deleteOfflinePackage(saved.id)
    expect(await listOfflinePackages('user-a')).toEqual([])
    await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    await clearOfflineDataForUser('user-a')
    expect(await listOfflinePackages('user-a')).toEqual([])
  })

  it('replaces a refreshed package only after its new snapshot is complete', async () => {
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    const updatedPlace = { ...place, name: 'Lyon mis à jour' }
    vi.mocked(getPlaces).mockResolvedValue([updatedPlace])
    await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    const packages = await listOfflinePackages('user-a')
    expect(packages).toHaveLength(1)
    expect(packages[0].snapshot.places[0]?.name).toBe('Lyon mis à jour')
  })
})
