import { describe, expect, it } from 'vitest'

import { BASEMAP_PREFERENCE_KEY, BASEMAPS, DEFAULT_BASEMAP_ID, createBasemaps, getThemeDefaultBasemapId, loadBasemapPreference, loadStoredBasemapPreference, parseBasemapId, resolveAvailableBasemapId, saveBasemapPreference } from './basemaps'

describe('basemap registry', () => {
  it('defines all configured online providers and the offline CartaVault styles', () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual(['cartavault-light', 'google-roadmap', 'cartavault-dark', 'stadia-light', 'stadia-dark', 'google-satellite', 'google-satellite-tiles', 'mapbox-satellite', 'satellite', 'osm'])
    expect(BASEMAPS.find((basemap) => basemap.id === 'google-roadmap')).toMatchObject({ kind: 'google' })
    expect(BASEMAPS.find((basemap) => basemap.id === 'mapbox-satellite')?.attribution).toContain('Mapbox')
  })

  it('never embeds provider credentials in client definitions', () => {
    expect(JSON.stringify(createBasemaps())).not.toMatch(/api_key|access_token/)
  })

  it('supports self-hosted CartaVault and raster URLs', () => {
    const basemaps = createBasemaps({ 'cartavault-light': true, 'cartavault-dark': true, satellite: true, osm: true }, {
      lightStyle: 'https://maps.example.test/styles/light.json', darkStyle: 'https://maps.example.test/styles/dark.json', openFreeMapTileJson: 'https://maps.example.test/planet', openFreeMapGlyphs: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf', satellite: 'https://maps.example.test/satellite/{z}/{x}/{y}.jpg', osm: 'https://maps.example.test/osm/{z}/{x}/{y}.png',
    })
    expect(basemaps.find((item) => item.id === 'cartavault-dark')).toMatchObject({ kind: 'vector', styleUrl: 'https://maps.example.test/styles/dark.json' })
    expect(basemaps.find((item) => item.id === 'osm')).toMatchObject({ kind: 'raster', url: 'https://maps.example.test/osm/{z}/{x}/{y}.png' })
  })
})

describe('basemap preference', () => {
  it('uses OSM as the safe default independently of the visual theme', () => {
    expect(DEFAULT_BASEMAP_ID).toBe('osm')
    expect(getThemeDefaultBasemapId(false)).toBe('osm')
    expect(getThemeDefaultBasemapId(true)).toBe('osm')
    expect(resolveAvailableBasemapId('unknown')).toBe('osm')
    expect(parseBasemapId('mapbox-satellite')).toBe('mapbox-satellite')
    expect(parseBasemapId('unknown')).toBeNull()
    expect(loadBasemapPreference({ getItem: () => 'unknown' } as unknown as Storage)).toBe('osm')
    expect(loadStoredBasemapPreference({ getItem: () => null } as unknown as Storage)).toBeNull()
  })

  it('persists a valid choice safely', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as unknown as Storage
    expect(saveBasemapPreference('osm', storage)).toBe(true)
    expect(values.get(BASEMAP_PREFERENCE_KEY)).toBe('osm')
  })
})
