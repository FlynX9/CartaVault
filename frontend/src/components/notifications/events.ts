export const NOTIFICATIONS_CHANGED_EVENT = 'cartavault:notifications-changed'

export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}
