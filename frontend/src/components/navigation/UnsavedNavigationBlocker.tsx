import { useEffect, type MutableRefObject } from 'react'
import { useBlocker } from 'react-router-dom'

interface Props {
  dirty: boolean
  requestLeave: () => Promise<boolean>
  skipNextNavigationRef: MutableRefObject<boolean>
}

/** Blocks PUSH, REPLACE and POP navigations before React Router changes route state. */
export function UnsavedNavigationBlocker({ dirty, requestLeave, skipNextNavigationRef }: Props) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (skipNextNavigationRef.current) return false
    // Admin sections stay mounted inside one console, so changing tabs does
    // not destroy their registered drafts.
    if (currentLocation.pathname.startsWith('/admin/') && nextLocation.pathname.startsWith('/admin/')) return false
    return dirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let cancelled = false
    void requestLeave().then((canLeave) => {
      if (cancelled || blocker.state !== 'blocked') return
      if (canLeave) blocker.proceed()
      else blocker.reset()
    })
    return () => { cancelled = true }
  }, [blocker, requestLeave])

  return null
}
