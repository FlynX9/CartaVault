export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cartavault.theme'

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function themeStorageKey(userId?: string | null): string {
  return userId ? `${THEME_STORAGE_KEY}:${userId}` : THEME_STORAGE_KEY
}

export function loadThemePreference(storage: Storage | null, userId?: string | null): ThemePreference {
  if (storage === null) return 'system'
  try {
    const scoped = userId ? storage.getItem(themeStorageKey(userId)) : null
    return parseThemePreference(scoped ?? storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function saveThemePreference(
  preference: ThemePreference,
  storage: Storage | null,
  userId?: string | null,
): void {
  if (storage === null) return
  try {
    storage.setItem(THEME_STORAGE_KEY, preference)
    if (userId) storage.setItem(themeStorageKey(userId), preference)
  } catch {
    // Storage can be unavailable in private browsing or hardened webviews.
  }
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
