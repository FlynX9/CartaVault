import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAuth } from '../auth/useAuth'
import {
  applyTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemePreference,
} from './theme'
import { ThemeContext, type ThemeContextValue } from './themeContext'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [preference, setPreferenceState] = useState<ThemePreference>(() => loadThemePreference(browserStorage()))
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
  )
  const resolvedTheme = resolveTheme(preference, systemPrefersDark)

  useEffect(() => {
    if (!userId) return
    setPreferenceState(loadThemePreference(browserStorage(), userId))
  }, [userId])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    setPreference: (nextPreference) => {
      setPreferenceState(nextPreference)
      saveThemePreference(nextPreference, browserStorage(), userId)
    },
    toggleTheme: () => {
      const nextPreference = resolvedTheme === 'dark' ? 'light' : 'dark'
      setPreferenceState(nextPreference)
      saveThemePreference(nextPreference, browserStorage(), userId)
    },
  }), [preference, resolvedTheme, userId])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
