export type DisplayDensity = '60' | '70' | '80' | '90' | '100' | 'compact' | 'comfortable' | 'spacious'

export const DISPLAY_DENSITY_STORAGE_KEY = 'cartavault.display-density'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function parseDisplayDensity(value: unknown): DisplayDensity {
  if (value === '60' || value === '70' || value === '80' || value === '90' || value === '100') return value
  if (value === 'compact') return '80'
  if (value === 'comfortable') return '90'
  return '100'
}

export function loadDisplayDensity(storage: Storage | null): DisplayDensity {
  if (storage === null) return '100'
  try {
    return parseDisplayDensity(storage.getItem(DISPLAY_DENSITY_STORAGE_KEY))
  } catch {
    return '100'
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

export function initializeDisplayDensity(): void {
  const density = loadDisplayDensity(browserStorage())
  applyDisplayDensity(density)
}
