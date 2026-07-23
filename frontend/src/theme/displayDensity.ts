export type DisplayDensity = 'compact' | 'comfortable' | 'spacious'

export const DISPLAY_DENSITY_STORAGE_KEY = 'cartavault.display-density'

export function parseDisplayDensity(value: unknown): DisplayDensity {
  return value === 'comfortable' || value === 'spacious' || value === 'compact'
    ? value
    : 'compact'
}

export function loadDisplayDensity(storage: Storage | null): DisplayDensity {
  if (storage === null) return 'compact'
  try {
    return parseDisplayDensity(storage.getItem(DISPLAY_DENSITY_STORAGE_KEY))
  } catch {
    return 'compact'
  }
}

export function saveDisplayDensity(density: DisplayDensity, storage: Storage | null): void {
  if (storage === null) return
  try {
    storage.setItem(DISPLAY_DENSITY_STORAGE_KEY, density)
  } catch {
    // Storage can be unavailable in private browsing or hardened webviews.
  }
}

export function applyDisplayDensity(density: DisplayDensity, root: HTMLElement = document.documentElement): void {
  root.dataset.density = density
}
