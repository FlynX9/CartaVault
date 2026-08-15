import type { OfflineDownloadProgress, OfflinePackageKind } from './offlineData'

export const OFFLINE_PROGRESS_CHANGED_EVENT = 'cartavault:offline-progress-changed'

export interface OfflineProgressItem {
  id: string
  userId: string
  kind: OfflinePackageKind
  title: string
  phase: OfflineDownloadProgress['phase']
  percent: number
  bytes: number
  reused: number
  status: 'running' | 'paused' | 'complete' | 'error'
  error?: string
  updatedAt: string
}

const progressItems = new Map<string, OfflineProgressItem>()
const removalTimers = new Map<string, number>()

const notify = () => window.dispatchEvent(new Event(OFFLINE_PROGRESS_CHANGED_EVENT))

export function offlineProgressId(userId: string, kind: OfflinePackageKind, sourceId: string): string {
  return `${userId}:${kind}:${sourceId}`
}

export function beginOfflineProgress(item: Pick<OfflineProgressItem, 'id' | 'userId' | 'kind' | 'title'>): void {
  const timer = removalTimers.get(item.id)
  if (timer !== undefined) window.clearTimeout(timer)
  removalTimers.delete(item.id)
  progressItems.set(item.id, { ...item, phase: 'data', percent: 0, bytes: 0, reused: 0, status: 'running', updatedAt: new Date().toISOString() })
  notify()
}

export function offlineDownloadPercent(progress: OfflineDownloadProgress): number {
  const ratio = progress.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0
  if (progress.phase === 'data') return Math.round(ratio * 5)
  if (progress.phase === 'basemap') return Math.round(5 + ratio * 90)
  return Math.round(95 + ratio * 5)
}

export function reportOfflineProgress(id: string, progress: OfflineDownloadProgress): void {
  const current = progressItems.get(id)
  if (!current) return
  const percent = offlineDownloadPercent(progress)
  progressItems.set(id, { ...current, phase: progress.phase, percent, bytes: progress.bytes, reused: progress.reused ?? 0, status: 'running', updatedAt: new Date().toISOString() })
  notify()
}

function scheduleRemoval(id: string): void {
  const previous = removalTimers.get(id)
  if (previous !== undefined) window.clearTimeout(previous)
  removalTimers.set(id, window.setTimeout(() => {
    removalTimers.delete(id)
    progressItems.delete(id)
    notify()
  }, 7_000))
}

export function completeOfflineProgress(id: string): void {
  const current = progressItems.get(id)
  if (!current) return
  progressItems.set(id, { ...current, phase: 'saving', percent: 100, status: 'complete', updatedAt: new Date().toISOString() })
  notify()
  scheduleRemoval(id)
}

export function pauseOfflineProgress(id: string): void {
  const current = progressItems.get(id)
  if (!current) return
  progressItems.set(id, { ...current, status: 'paused', updatedAt: new Date().toISOString() })
  notify()
}

export function failOfflineProgress(id: string, error: string): void {
  const current = progressItems.get(id)
  if (!current) return
  progressItems.set(id, { ...current, status: 'error', error, updatedAt: new Date().toISOString() })
  notify()
  scheduleRemoval(id)
}

export function readOfflineProgress(userId: string): OfflineProgressItem[] {
  return [...progressItems.values()]
    .filter((item) => item.userId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function clearOfflineProgress(): void {
  removalTimers.forEach((timer) => window.clearTimeout(timer))
  removalTimers.clear()
  progressItems.clear()
  notify()
}
