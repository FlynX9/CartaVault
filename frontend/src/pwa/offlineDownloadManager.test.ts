import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteOfflineDownloadJob, downloadMapOfflinePackage, listOfflineDownloadJobs, requestPersistentOfflineStorage, saveOfflineDownloadJob } from './offlineData'
import { resumeOfflineDownloads } from './offlineDownloadManager'
import { clearOfflineProgress, readOfflineProgress } from './offlineProgress'
import type { OfflineDownloadJob } from './offlineData'

vi.mock('./offlineData', () => ({
  deleteOfflineDownloadJob: vi.fn(),
  downloadMapOfflinePackage: vi.fn(),
  downloadTripOfflinePackage: vi.fn(),
  isNetworkFailure: (reason: unknown) => reason instanceof TypeError,
  listOfflineDownloadJobs: vi.fn(),
  requestPersistentOfflineStorage: vi.fn(),
  saveOfflineDownloadJob: vi.fn(),
}))

const job: OfflineDownloadJob = {
  id: 'user-1:map:map-1',
  userId: 'user-1',
  kind: 'map',
  sourceId: 'map-1',
  map: { id: 'map-1', name: 'Belgique', country: { iso_alpha2: 'BE', name: 'Belgique' } } as OfflineDownloadJob['map'],
  tripId: null,
  title: 'Belgique',
  options: { basemap: true, places: true, organization: true, trip: false, annotations: true, routeGeometry: false, thumbnails: true },
  status: 'running',
  progress: { phase: 'basemap', completed: 40, total: 100, bytes: 2048 },
  error: null,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:01:00.000Z',
}

beforeEach(() => {
  clearOfflineProgress()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  vi.mocked(listOfflineDownloadJobs).mockResolvedValue([job])
  vi.mocked(requestPersistentOfflineStorage).mockResolvedValue(true)
  vi.mocked(downloadMapOfflinePackage).mockImplementation(async (_userId, _map, _options, _signal, onProgress) => {
    onProgress?.({ phase: 'basemap', completed: 80, total: 100, bytes: 4096 })
    onProgress?.({ phase: 'saving', completed: 1, total: 1, bytes: 8192 })
    return {} as never
  })
})

describe('offline download manager', () => {
  it('resumes a persisted job and completes it after the application reloads', async () => {
    await resumeOfflineDownloads('user-1')

    expect(downloadMapOfflinePackage).toHaveBeenCalledWith('user-1', job.map, job.options, undefined, expect.any(Function))
    expect(deleteOfflineDownloadJob).toHaveBeenCalledWith(job.id)
    expect(readOfflineProgress('user-1')).toEqual([expect.objectContaining({ id: job.id, percent: 100, status: 'complete' })])
  })

  it('keeps a persisted job paused while the device is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await resumeOfflineDownloads('user-1')

    expect(downloadMapOfflinePackage).not.toHaveBeenCalled()
    expect(saveOfflineDownloadJob).toHaveBeenCalledWith(expect.objectContaining({ id: job.id, status: 'queued' }))
    expect(readOfflineProgress('user-1')).toEqual([expect.objectContaining({ id: job.id, status: 'paused' })])
  })
})
