import { messages, type TranslationKey } from './messages'

export type Locale = keyof typeof messages
export type TranslationParams = Record<string, string | number>

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export const SAFE_FALLBACK_LOCALE: Locale = 'fr'
export const LOCALE_STORAGE_KEY = 'cartavault.locale'

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().split(/[-_]/, 1)[0]
  return SUPPORTED_LOCALES.find((locale) => locale === normalized) ?? null
}

export function resolveInitialLocale(
  stored: string | null | undefined,
  browserLanguages: readonly string[],
  instanceDefault: string | null | undefined,
): Locale {
  return normalizeLocale(stored)
    ?? browserLanguages.map(normalizeLocale).find((locale): locale is Locale => locale !== null)
    ?? normalizeLocale(instanceDefault)
    ?? SAFE_FALLBACK_LOCALE
}

export function translate(locale: Locale, key: TranslationKey, params: TranslationParams = {}): string {
  const candidate = typeof params.count === 'number'
    ? `${key}_${new Intl.PluralRules(locale).select(params.count)}` as TranslationKey
    : key
  const pluralKey = candidate in messages[locale] ? candidate : key
  const template = messages[locale][pluralKey] ?? messages[SAFE_FALLBACK_LOCALE][pluralKey] ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`))
}

export function localeStorageKey(userId?: string | null): string {
  return userId ? `${LOCALE_STORAGE_KEY}.${userId}` : LOCALE_STORAGE_KEY
}

export function loadStoredLocale(storage: Storage | null, userId?: string | null): Locale | null {
  try {
    return normalizeLocale(storage?.getItem(localeStorageKey(userId)))
  } catch {
    return null
  }
}

export function saveStoredLocale(locale: Locale, storage: Storage | null, userId?: string | null): void {
  try {
    storage?.setItem(localeStorageKey(userId), locale)
    if (!userId) storage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // The language remains active for the current session when storage is unavailable.
  }
}
