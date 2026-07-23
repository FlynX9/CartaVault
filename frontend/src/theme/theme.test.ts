import { describe, expect, it } from 'vitest'

import {
  applyTheme,
  loadThemePreference,
  parseThemePreference,
  resolveTheme,
  saveThemePreference,
  themeStorageKey,
} from './theme'

describe('CartaVault theme preferences', () => {
  it('normalizes unknown preferences and resolves the system theme', () => {
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('sepia')).toBe('system')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('persists a global preference and a user-scoped preference', () => {
    const storage = new MemoryStorage()

    saveThemePreference('dark', storage, 'user-1')

    expect(storage.getItem('cartavault.theme')).toBe('dark')
    expect(storage.getItem(themeStorageKey('user-1'))).toBe('dark')
    expect(loadThemePreference(storage, 'user-1')).toBe('dark')
  })

  it('prefers the user-scoped setting and falls back to the global setting', () => {
    const storage = new MemoryStorage()
    storage.setItem('cartavault.theme', 'light')
    storage.setItem(themeStorageKey('user-1'), 'dark')

    expect(loadThemePreference(storage, 'user-1')).toBe('dark')
    expect(loadThemePreference(storage, 'user-2')).toBe('light')
  })

  it('applies the resolved theme to the root element', () => {
    const root = document.createElement('div')

    applyTheme('dark', root)

    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })
})

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}
