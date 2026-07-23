import { describe, expect, it } from 'vitest'

import {
  applyDisplayDensity,
  DISPLAY_DENSITY_STORAGE_KEY,
  loadDisplayDensity,
  parseDisplayDensity,
  saveDisplayDensity,
} from './displayDensity'

describe('CartaVault display density', () => {
  it('normalizes unknown values to the existing compact scale', () => {
    expect(parseDisplayDensity('compact')).toBe('compact')
    expect(parseDisplayDensity('comfortable')).toBe('comfortable')
    expect(parseDisplayDensity('spacious')).toBe('spacious')
    expect(parseDisplayDensity('browser-zoom')).toBe('compact')
  })

  it('stores the selected density for the next application paint', () => {
    const storage = new MemoryStorage()

    saveDisplayDensity('spacious', storage)

    expect(storage.getItem(DISPLAY_DENSITY_STORAGE_KEY)).toBe('spacious')
    expect(loadDisplayDensity(storage)).toBe('spacious')
  })

  it('applies the density to the application root', () => {
    const root = document.createElement('div')

    applyDisplayDensity('comfortable', root)

    expect(root).toHaveAttribute('data-density', 'comfortable')
  })
})

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
