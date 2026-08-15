import {
  deleteOfflineDownloadJob,
  downloadMapOfflinePackage,
  downloadTripOfflinePackage,
  isNetworkFailure,
  listOfflineDownloadJobs,
  requestPersistentOfflineStorage,
  saveOfflineDownloadJob,
  type OfflineDownloadJob,
  type OfflineDownloadProgress,
  type OfflinePackageOptions,
} from './offlineData'
import {
  beginOfflineProgress,
  completeOfflineProgress,
  failOfflineProgress,
  offlineDownloadPercent,
  offlineProgressId,
  pauseOfflineProgress,
  reportOfflineProgress,
} from './offlineProgress'
import type { PoiMap } from '../types/map'

const runningJobs = new Map<string, Promise<void>>()
const deviceIsOffline = () => navigator.onLine === false

function restoreNotification(job: OfflineDownloadJob): void {
  beginOfflineProgress({ id: job.id, userId: job.userId, kind: job.kind, title: job.title })
  if (job.progress) reportOfflineProgress(job.id, job.progress)
  if (job.status === 'queued') pauseOfflineProgress(job.id)
}

async function executeJob(job: OfflineDownloadJob, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<void> {
  if (deviceIsOffline()) {
    await saveOfflineDownloadJob({ ...job, status: 'queued', updatedAt: new Date().toISOString() })
    restoreNotification({ ...job, status: 'queued' })
    return
  }
  await requestPersistentOfflineStorage()
  let current = { ...job, status: 'running' as const, error: null, updatedAt: new Date().toISOString() }
  await saveOfflineDownloadJob(current)
  restoreNotification(current)
  let persistedPercent = current.progress ? offlineDownloadPercent(current.progress) : -1
  let persistedPhase = current.progress?.phase
  let checkpoint = Promise.resolve()
  const update = (progress: OfflineDownloadProgress) => {
    reportOfflineProgress(job.id, progress)
    onProgress?.(progress)
    const percent = offlineDownloadPercent(progress)
    if (percent !== persistedPercent || progress.phase !== persistedPhase) {
      persistedPercent = percent
      persistedPhase = progress.phase
      current = { ...current, progress, updatedAt: new Date().toISOString() }
      checkpoint = checkpoint.then(() => saveOfflineDownloadJob(current)).catch(() => undefined)
    }
  }
  try {
    if (job.kind === 'trip' && job.tripId) await downloadTripOfflinePackage(job.userId, job.map, job.tripId, job.options, undefined, update)
    else await downloadMapOfflinePackage(job.userId, job.map, job.options, undefined, update)
    await checkpoint
    await deleteOfflineDownloadJob(job.id)
    completeOfflineProgress(job.id)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Téléchargement hors ligne impossible.'
    if (deviceIsOffline() || isNetworkFailure(reason)) {
      await checkpoint
      const queued = { ...current, status: 'queued' as const, error: null, updatedAt: new Date().toISOString() }
      await saveOfflineDownloadJob(queued)
      pauseOfflineProgress(job.id)
      return
    }
    await checkpoint
    await deleteOfflineDownloadJob(job.id)
    failOfflineProgress(job.id, message)
    throw reason
  }
}

export function runOfflineDownloadJob(job: OfflineDownloadJob, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<void> {
  const running = runningJobs.get(job.id)
  if (running) return running
  const task = executeJob(job, onProgress).finally(() => runningJobs.delete(job.id))
  runningJobs.set(job.id, task)
  return task
}

export async function startOfflineDownload(input: {
  userId: string
  kind: 'map' | 'trip'
  sourceId: string
  map: PoiMap
  tripId?: string | null
  title: string
  options: OfflinePackageOptions
}, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<void> {
  const timestamp = new Date().toISOString()
  const job: OfflineDownloadJob = {
    id: offlineProgressId(input.userId, input.kind, input.sourceId),
    userId: input.userId,
    kind: input.kind,
    sourceId: input.sourceId,
    map: input.map,
    tripId: input.tripId ?? null,
    title: input.title,
    options: input.options,
    status: 'queued',
    progress: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await saveOfflineDownloadJob(job)
  return runOfflineDownloadJob(job, onProgress)
}

export async function resumeOfflineDownloads(userId: string): Promise<void> {
  const jobs = (await listOfflineDownloadJobs(userId)).filter((job) => job.status !== 'error')
  jobs.forEach(restoreNotification)
  if (deviceIsOffline()) {
    await Promise.all(jobs.map(async (job) => {
      if (job.status !== 'queued') await saveOfflineDownloadJob({ ...job, status: 'queued', updatedAt: new Date().toISOString() })
      pauseOfflineProgress(job.id)
    }))
    return
  }
  for (const job of jobs) await runOfflineDownloadJob(job).catch(() => undefined)
}
