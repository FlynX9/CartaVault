import { describe, expect, it } from 'vitest'

import { BASEMAP_PREFERENCE_KEY, BASEMAPS, DEFAULT_BASEMAP_ID, createBasemaps, getThemeDefaultBasemapId, loadBasemapPreference, loadStoredBasemapPreference, parseBasemapId, resolveAvailableBasemapId, saveBasemapPreference } from './basemaps'

describe('basemap registry', () => {
  it('defines the four reviewed basemaps with their attribution', () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual(['cartavault-light', 'cartavault-dark', 'satellite', 'osm'])
    expect(new Set(BASEMAPS.map((basemap) => basemap.label)).size).toBe(4)
    expect(BASEMAPS.every((basemap) => basemap.attribution.includes('OpenStreetMap'))).toBe(true)
  })

  it('adds a configured Stadia key and never emits an undefined query value', () => {
    expect(createBasemaps(' reviewed-key ')[0].url).toContain('api_key=reviewed-key')
    expect(createBasemaps(undefined).every((basemap) => !basemap.url.includes('api_key=undefined'))).toBe(true)
    expect(createBasemaps('').every((basemap) => !basemap.url.includes('api_key='))).toBe(true)
  })

  it('disables providers from configuration without removing the controlled OSM fallback', () => {
    const basemaps = createBasemaps(undefined, {
      'cartavault-light': false,
      'cartavault-dark': true,
      satellite: false,
      osm: false,
    })
    expect(basemaps.filter((basemap) => basemap.enabled).map((basemap) => basemap.id)).toEqual(['cartavault-dark'])
    expect(basemaps.find((basemap) => basemap.id === 'osm')?.url).toContain('openstreetmap.org')
  })
})

describe('basemap preference', () => {
  it('accepts only known values and falls back safely', () => {
    expect(parseBasemapId('satellite')).toBe('satellite')
    expect(parseBasemapId('unknown')).toBeNull()
    expect(loadBasemapPreference({ getItem: () => 'unknown' } as unknown as Storage)).toBe(DEFAULT_BASEMAP_ID)
  })

  it('uses the theme default and distinguishes an absent local preference', () => {
    expect(getThemeDefaultBasemapId(false)).toBe('cartavault-light')
    expect(getThemeDefaultBasemapId(true)).toBe('cartavault-dark')
    expect(resolveAvailableBasemapId('unknown', false)).toBe('cartavault-light')
    expect(loadStoredBasemapPreference({ getItem: () => null } as unknown as Storage)).toBeNull()
  })

  it('persists a valid choice without relying on browser storage availability', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as unknown as Storage
    expect(saveBasemapPreference('osm', storage)).toBe(true)
    expect(values.get(BASEMAP_PREFERENCE_KEY)).toBe('osm')
    expect(saveBasemapPreference('osm', { setItem: () => { throw new Error('blocked') } } as unknown as Storage)).toBe(false)
  })
})
