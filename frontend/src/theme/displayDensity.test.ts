/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  applyDisplayDensity,
  DISPLAY_DENSITY_STORAGE_KEY,
  initializeDisplayDensity,
  loadDisplayDensity,
  parseDisplayDensity,
  saveDisplayDensity,
} from './displayDensity'

const stylesheet = readFileSync('src/index.css', 'utf8')

describe('CartaVault display density', () => {
  it('migrates legacy values and normalizes unknown values to 100 %', () => {
    expect(parseDisplayDensity('compact')).toBe('80')
    expect(parseDisplayDensity('comfortable')).toBe('90')
    expect(parseDisplayDensity('spacious')).toBe('100')
    expect(parseDisplayDensity('browser-zoom')).toBe('100')
  })

  it('stores the selected density for the next application paint', () => {
    const storage = new MemoryStorage()

    saveDisplayDensity('spacious', storage)

    expect(storage.getItem(DISPLAY_DENSITY_STORAGE_KEY)).toBe('spacious')
    expect(loadDisplayDensity(storage)).toBe('100')
  })

  it('applies the density to the application root', () => {
    const root = document.createElement('div')

    applyDisplayDensity('comfortable', root)

    expect(root).toHaveAttribute('data-density', 'comfortable')
  })

  it('initializes the document from the persisted density before the app mounts', () => {
    window.localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, '80')

    initializeDisplayDensity()

    expect(document.documentElement).toHaveAttribute('data-density', '80')
  })

  it('keeps the scaled application grid constrained to the viewport', () => {
    const navigationDeclarations = [...stylesheet.matchAll(/\.cv-main-navigation\s*\{([^}]*)\}/g)]
      .map((match) => match[1])
      .join('\n')

    expect(stylesheet).toMatch(/\.app-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s)
    expect(stylesheet).toMatch(/\.app-body\s*\{[^}]*height:\s*100%[^}]*overflow:\s*hidden/s)
    expect(navigationDeclarations).toMatch(/height:\s*100%/)
    expect(navigationDeclarations).not.toMatch(/height:\s*\d+(?:\.\d+)?dvh/)
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
