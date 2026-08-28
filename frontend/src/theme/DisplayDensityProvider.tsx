import { useEffect, useState, type ReactNode } from 'react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, getAccountPreferences } from '../api/account'
import { useAuth } from '../auth/useAuth'
import {
  applyDisplayDensity,
  loadDisplayDensity,
  parseDisplayDensity,
  saveDisplayDensity,
  type DisplayDensity,
} from './displayDensity'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function DisplayDensityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [density, setDensity] = useState<DisplayDensity>(() => loadDisplayDensity(browserStorage()))

  useEffect(() => {
    applyDisplayDensity(density)
    saveDisplayDensity(density, browserStorage())
  }, [density])

  useEffect(() => {
    if (!user) {
      setDensity(loadDisplayDensity(browserStorage()))
      return
    }
    const controller = new AbortController()
    void getAccountPreferences(controller.signal)
      .then((preferences) => {
        if (!controller.signal.aborted) setDensity(parseDisplayDensity(preferences.density))
      })
      .catch(() => undefined)
    const sync = (event: Event) => {
      setDensity(parseDisplayDensity((event as CustomEvent<{ density: DisplayDensity }>).detail.density))
    }
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, sync)
    return () => {
      controller.abort()
      window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, sync)
    }
  }, [user?.id])

  return children
}
