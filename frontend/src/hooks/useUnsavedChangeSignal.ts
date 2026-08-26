import { useEffect } from 'react'

export const UNSAVED_CHANGE_EVENT = 'cartavault:unsaved-change'
export const ALLOW_UNSAVED_NAVIGATION_EVENT = 'cartavault:allow-unsaved-navigation-once'

export function allowNextUnsavedNavigation() {
  document.dispatchEvent(new Event(ALLOW_UNSAVED_NAVIGATION_EVENT))
}

/** Publishes a component-local draft without coupling it to the app shell. */
export function useUnsavedChangeSignal(source: string, dirty: boolean) {
  useEffect(() => {
    document.dispatchEvent(new CustomEvent(UNSAVED_CHANGE_EVENT, { detail: { source, dirty } }))
  }, [dirty, source])

  useEffect(() => () => {
    document.dispatchEvent(new CustomEvent(UNSAVED_CHANGE_EVENT, { detail: { source, dirty: false } }))
  }, [source])
}
