import { describe, expect, it } from 'vitest'

import { BASEMAP_PREFERENCE_KEY, BASEMAPS, DEFAULT_BASEMAP_ID, createBasemaps, getThemeDefaultBasemapId, loadBasemapPreference, loadStoredBasemapPreference, parseBasemapId, resolveAvailableBasemapId, saveBasemapPreference } from './basemaps'

describe('basemap registry', () => {
  it('defines the four reviewed basemaps with their attribution', () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual(['cartavault-light', 'cartavault-dark', 'satellite', 'osm'])
    expect(new Set(BASEMAPS.map((basemap) => basemap.label)).size).toBe(4)
    expect(BASEMAPS.every((basemap) => basemap.attribution.includes('OpenStreetMap'))).toBe(true)
  })

  it('uses OpenFreeMap without a key and restricts the optional Stadia key to satellite', () => {
    const withKey = createBasemaps(' reviewed-key ')
    expect(withKey.slice(0, 2).every((basemap) => basemap.kind === 'vector' && !JSON.stringify(basemap).includes('api_key'))).toBe(true)
    expect(withKey[2]).toMatchObject({ kind: 'raster', url: expect.stringContaining('api_key=reviewed-key') })
    expect(JSON.stringify(createBasemaps(undefined))).not.toContain('api_key=undefined')
  })

  it('supports self-hosted styles and vector tiles without appending a provider key', () => {
    const basemaps = createBasemaps('reviewed-key', {
      'cartavault-light': true,
      'cartavault-dark': true,
      satellite: true,
      osm: true,
    }, {
      lightStyle: 'https://maps.example.test/styles/light.json',
      darkStyle: 'https://maps.example.test/styles/dark.json',
      openFreeMapTileJson: 'https://maps.example.test/tiles.json',
      openFreeMapGlyphs: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf',
      satellite: 'https://maps.example.test/satellite/{z}/{x}/{y}.jpg',
      osm: 'https://maps.example.test/osm/{z}/{x}/{y}.png',
    })
    expect(basemaps[0]).toMatchObject({ kind: 'vector', styleUrl: 'https://maps.example.test/styles/light.json', tileJsonUrl: 'https://maps.example.test/tiles.json' })
    expect(basemaps[1]).toMatchObject({ kind: 'vector', styleUrl: 'https://maps.example.test/styles/dark.json', glyphsUrl: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf' })
    expect(basemaps[2]).toMatchObject({ kind: 'raster', url: 'https://maps.example.test/satellite/{z}/{x}/{y}.jpg' })
    expect(basemaps[3]).toMatchObject({ kind: 'raster', url: 'https://maps.example.test/osm/{z}/{x}/{y}.png' })
    expect(basemaps.every((basemap) => !basemap.requiresStadiaAuthentication)).toBe(true)
  })

  it('disables providers from configuration without removing the controlled OSM fallback', () => {
    const basemaps = createBasemaps(undefined, {
      'cartavault-light': false,
      'cartavault-dark': true,
      satellite: false,
      osm: false,
    })
    expect(basemaps.filter((basemap) => basemap.enabled).map((basemap) => basemap.id)).toEqual(['cartavault-dark'])
    expect(basemaps.find((basemap) => basemap.id === 'osm')).toMatchObject({ kind: 'raster', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' })
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
