import { createContext } from 'react'

import { SAFE_FALLBACK_LOCALE, translate, type Locale, type TranslationParams } from './i18n'
import type { TranslationKey } from './messages'

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, params?: TranslationParams) => string
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export const fallbackI18nContext: I18nContextValue = {
  locale: SAFE_FALLBACK_LOCALE,
  setLocale: () => undefined,
  t: (key, params) => translate(SAFE_FALLBACK_LOCALE, key, params),
  formatDate: (value, options = { dateStyle: 'long' }) => new Intl.DateTimeFormat(SAFE_FALLBACK_LOCALE, options).format(
    typeof value === 'string' ? new Date(value) : value,
  ),
  formatNumber: (value, options) => new Intl.NumberFormat(SAFE_FALLBACK_LOCALE, options).format(value),
}

export const I18nContext = createContext<I18nContextValue>(fallbackI18nContext)
