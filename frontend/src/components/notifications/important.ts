export interface ImportantNotificationEntry {
  id: string
  kind: 'credential'
  provider: string
  message: string
  createdAt: string
}

const STORAGE_KEY = 'cartavault:important-notifications'
export const IMPORTANT_NOTIFICATIONS_CHANGED_EVENT = 'cartavault:important-notifications-changed'

export function readImportantNotifications(): ImportantNotificationEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ImportantNotificationEntry => typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string' && 'message' in item && typeof item.message === 'string' && 'createdAt' in item && typeof item.createdAt === 'string')
  } catch {
    return []
  }
}

function write(entries: ImportantNotificationEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 20)))
  window.dispatchEvent(new Event(IMPORTANT_NOTIFICATIONS_CHANGED_EVENT))
}

export function reportCredentialIssue(provider: string, message: string) {
  const id = `credential:${provider}`
  const entry: ImportantNotificationEntry = { id, kind: 'credential', provider, message, createdAt: new Date().toISOString() }
  write([entry, ...readImportantNotifications().filter((current) => current.id !== id)])
}

export function clearCredentialIssue(provider: string) {
  const entries = readImportantNotifications()
  const next = entries.filter((entry) => entry.id !== `credential:${provider}`)
  if (next.length !== entries.length) write(next)
}
