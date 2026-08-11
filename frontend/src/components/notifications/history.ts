export const NOTIFICATION_HISTORY_CHANGED_EVENT = 'cartavault:notification-history-changed'

export type NotificationHistoryKind = 'error' | 'success' | 'information'

export interface NotificationHistoryEntry {
  id: string
  kind: NotificationHistoryKind
  message: string
  createdAt: string
}

const STORAGE_KEY = 'cartavault:notification-history'
const HISTORY_LIMIT = 20
let sequence = 0

export function readNotificationHistory(): NotificationHistoryEntry[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return stored.filter(isHistoryEntry).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function addNotificationHistory(kind: NotificationHistoryKind, message: string): void {
  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  if (!normalizedMessage) return
  const entry: NotificationHistoryEntry = {
    id: `${Date.now()}-${++sequence}`,
    kind,
    message: normalizedMessage,
    createdAt: new Date().toISOString(),
  }
  const history = [entry, ...readNotificationHistory()].slice(0, HISTORY_LIMIT)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // The event still updates the current page when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<NotificationHistoryEntry>(NOTIFICATION_HISTORY_CHANGED_EVENT, { detail: entry }))
}

function isHistoryEntry(value: unknown): value is NotificationHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<NotificationHistoryEntry>
  return typeof entry.id === 'string'
    && (entry.kind === 'error' || entry.kind === 'success' || entry.kind === 'information')
    && typeof entry.message === 'string'
    && typeof entry.createdAt === 'string'
}
