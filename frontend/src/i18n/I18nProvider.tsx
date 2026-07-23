import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, getAccountPreferences } from '../api/account'
import { useAuth } from '../auth/useAuth'
import type { AccountPreferences } from '../types/account'
import {
  loadStoredLocale,
  resolveInitialLocale,
  saveStoredLocale,
  translate,
  type Locale,
} from './i18n'
import { I18nContext, type I18nContextValue } from './i18nContext'
import type { TranslationKey } from './messages'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const instanceDefault = import.meta.env.VITE_DEFAULT_LANGUAGE

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale(
    loadStoredLocale(browserStorage()),
    navigator.languages ?? [navigator.language],
    instanceDefault,
  ))

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    saveStoredLocale(nextLocale, browserStorage(), userId)
  }, [userId])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    void getAccountPreferences(controller.signal)
      .then((preferences) => {
        setLocaleState(preferences.language)
        saveStoredLocale(preferences.language, browserStorage(), userId)
      })
      .catch(() => {
        const stored = loadStoredLocale(browserStorage(), userId)
        if (stored) setLocaleState(stored)
      })
    return () => controller.abort()
  }, [userId])

  useEffect(() => {
    const update = (event: Event) => {
      const preferences = (event as CustomEvent<AccountPreferences>).detail
      if (preferences?.language) setLocale(preferences.language)
    }
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, update)
    return () => window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, update)
  }, [setLocale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key: TranslationKey, params = {}) => translate(locale, key, params),
    formatDate: (value, options = { dateStyle: 'long' }) => new Intl.DateTimeFormat(locale, options).format(
      typeof value === 'string' ? new Date(value) : value,
    ),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  }), [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
