import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/categories', () => ({ getCategories: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/photos', () => ({ getPlacePhotos: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/places', () => ({ getPlaces: vi.fn().mockResolvedValue([]), getPlaceDetails: vi.fn() }))
vi.mock('../api/statuses', () => ({ getStatuses: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/tags', () => ({ getTags: vi.fn().mockResolvedValue([]) }))
vi.mock('../api/trips', () => ({ getTrip: vi.fn() }))
vi.mock('../api/vectorBasemap', () => ({
  getCartaVaultVectorConfig: vi.fn().mockResolvedValue({
    enabled: true,
    available: true,
    country_code: 'FR',
    country_name: 'France',
    state: 'ready',
    phase: 'Disponible',
    error_code: null,
    error_message: null,
    archive_url: '/api/basemaps/cartavault/archive/fr.pmtiles',
    glyphs_url: '/api/basemaps/cartavault/fonts/{fontstack}/{range}.pbf',
    version: 'fr-test',
    min_zoom: 0,
    max_zoom: 14,
    offline_min_zoom: 5,
    offline_max_zoom: 5,
    offline_padding_km: 0,
    offline_max_tiles: 25_000,
    attribution: '© OpenStreetMap contributors',
  }),
}))
const { getZxyMock } = vi.hoisted(() => ({ getZxyMock: vi.fn().mockResolvedValue({ data: new Uint8Array([1, 2, 3]) }) }))
vi.mock('pmtiles', () => ({ PMTiles: class { getZxy = getZxyMock } }))

import { clearOfflineDataForUser, defaultMapOfflineOptions, deleteOfflineDownloadJob, deleteOfflinePackage, downloadMapOfflinePackage, getOfflinePackage, listOfflineDownloadJobs, listOfflinePackages, OFFLINE_PACKAGES_CHANGED_EVENT, offlineMaps, saveOfflineDownloadJob, setOfflineIdentity } from './offlineData'
import { getCartaVaultVectorConfig } from '../api/vectorBasemap'
import { getPlaces } from '../api/places'
import type { PoiMap } from '../types/map'
import type { PlaceDetails } from '../types/place'

const map = { id: 'map-1', name: 'France', updated_at: '2026-08-08T00:00:00Z', country: { name: 'France', iso_alpha2: 'FR' } } as unknown as PoiMap
const place = { id: 'place-1', map_id: 'map-1', name: 'Lyon', latitude: 45.75, longitude: 4.85, status: { id: 'status-1', color: '#0FA68A' }, categories: [], tags: [], is_favorite: false } as unknown as PlaceDetails

describe('offline data packages', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    getZxyMock.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) })
    window.localStorage.clear()
    await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase('cartavault-offline'); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve() })
    vi.mocked(getPlaces).mockResolvedValue([place])
  })

  it('stores a map package and never exposes it to another account', async () => {
    const changes: string[] = []
    const onChange = (event: Event) => changes.push((event as CustomEvent<{ userId: string }>).detail.userId)
    window.addEventListener(OFFLINE_PACKAGES_CHANGED_EVENT, onChange)
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    const saved = await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    expect(saved.snapshot.places).toEqual([place])
    expect(await listOfflinePackages('user-a')).toHaveLength(1)
    expect(await getOfflinePackage('user-a', 'map', 'map-1')).not.toBeNull()
    expect(await offlineMaps()).toEqual([map])
    setOfflineIdentity({ id: 'user-b', email: 'b@example.test', display_name: 'B', is_admin: false })
    expect(await offlineMaps()).toEqual([])
    expect(changes).toEqual(['user-a'])
    window.removeEventListener(OFFLINE_PACKAGES_CHANGED_EVENT, onChange)
  })

  it('normalizes legacy packages whose optional collections are missing', async () => {
    const saved = await downloadMapOfflinePackage('user-a', map, { ...defaultMapOfflineOptions, basemap: false })
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cartavault-offline', 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('packages', 'readwrite')
      transaction.objectStore('packages').put({ ...saved, actualBytes: undefined, included: undefined, snapshot: { map } })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()

    const [legacy] = await listOfflinePackages('user-a')
    expect(legacy.actualBytes).toBe(saved.estimatedBytes)
    expect(legacy.included).toEqual(defaultMapOfflineOptions)
    expect(legacy.snapshot.places).toEqual([])
    expect(legacy.snapshot.annotations).toEqual({})
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

  it('stores map data without requesting vector tiles when the map option is disabled', async () => {
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    const saved = await downloadMapOfflinePackage('user-a', map, { ...defaultMapOfflineOptions, basemap: false })

    expect(saved.included.basemap).toBe(false)
    expect(saved.basemap).toBeUndefined()
    expect(getCartaVaultVectorConfig).not.toHaveBeenCalled()
  })

  it('persists an interrupted download job for recovery after a reload', async () => {
    const timestamp = new Date().toISOString()
    const job = { id: 'user-a:map:map-1', userId: 'user-a', kind: 'map' as const, sourceId: map.id, map, tripId: null, title: map.name, options: defaultMapOfflineOptions, status: 'running' as const, progress: { phase: 'basemap' as const, completed: 25, total: 100, bytes: 1024 }, error: null, createdAt: timestamp, updatedAt: timestamp }

    await saveOfflineDownloadJob(job)
    expect(await listOfflineDownloadJobs('user-a')).toEqual([job])
    await deleteOfflineDownloadJob(job.id)
    expect(await listOfflineDownloadJobs('user-a')).toEqual([])
  })

  it('reuses vector tiles already stored on the device without downloading them again', async () => {
    setOfflineIdentity({ id: 'user-a', email: 'a@example.test', display_name: 'A', is_admin: false })
    await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions)
    const firstDownloadCalls = getZxyMock.mock.calls.length
    const progress: Array<{ bytes: number; reused?: number }> = []

    await downloadMapOfflinePackage('user-a', map, defaultMapOfflineOptions, undefined, (value) => {
      if (value.phase === 'basemap') progress.push(value)
    })

    expect(firstDownloadCalls).toBeGreaterThan(0)
    expect(getZxyMock).toHaveBeenCalledTimes(firstDownloadCalls)
    expect(progress.at(-1)).toEqual(expect.objectContaining({ bytes: 0, reused: firstDownloadCalls }))
  })
})
