import { describe, expect, it } from 'vitest'

import { BASEMAP_PREFERENCE_KEY, BASEMAPS, DEFAULT_BASEMAP_ID, createBasemaps, getThemeDefaultBasemapId, loadBasemapPreference, loadStoredBasemapPreference, parseBasemapId, resolveAvailableBasemapId, saveBasemapPreference } from './basemaps'

describe('basemap registry', () => {
  it('exposes only supported online, fallback, and offline renderers', () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual([
      'openfreemap-light', 'openfreemap-dark', 'arcgis-satellite',
      'google-satellite', 'osm', 'offline-vector-light', 'offline-vector-dark',
    ])
    expect(JSON.stringify(BASEMAPS)).not.toMatch(/Stadia|Mapbox|google-satellite-tiles/)
  })

  it('keeps provider credentials out of client definitions', () => {
    expect(JSON.stringify(createBasemaps())).not.toMatch(/api_key|access_token/)
  })

  it('keeps OSM as a raster fallback and PMTiles styles as offline-only entries', () => {
    expect(BASEMAPS.find((item) => item.id === 'osm')).toMatchObject({ kind: 'raster' })
    expect(BASEMAPS.find((item) => item.id === 'offline-vector-light')).toMatchObject({ kind: 'vector', source: 'cartavault' })
    expect(BASEMAPS.find((item) => item.id === 'openfreemap-light')).toMatchObject({ kind: 'vector', source: 'remote-style' })
  })
})

describe('basemap preference migration', () => {
  it.each([
    ['cartavault-light', 'openfreemap-light'],
    ['stadia-light', 'openfreemap-light'],
    ['google-roadmap', 'openfreemap-light'],
    ['cartavault-dark', 'openfreemap-dark'],
    ['stadia-dark', 'openfreemap-dark'],
    ['satellite', 'arcgis-satellite'],
    ['stadia-satellite', 'arcgis-satellite'],
    ['mapbox-satellite', 'arcgis-satellite'],
    ['google-map-tiles', 'google-satellite'],
    ['google-satellite-tiles', 'google-satellite'],
  ])('migrates %s to %s', (legacy, expected) => {
    expect(parseBasemapId(legacy)).toBe(expected)
  })

  it('uses OpenFreeMap as the safe default and rejects unknown IDs', () => {
    expect(DEFAULT_BASEMAP_ID).toBe('openfreemap-light')
    expect(getThemeDefaultBasemapId(false)).toBe('openfreemap-light')
    expect(getThemeDefaultBasemapId(true)).toBe('openfreemap-dark')
    expect(resolveAvailableBasemapId('unknown')).toBe('openfreemap-light')
    expect(parseBasemapId('unknown')).toBeNull()
    expect(loadBasemapPreference({ getItem: () => 'unknown' } as unknown as Storage)).toBe('openfreemap-light')
    expect(loadStoredBasemapPreference({ getItem: () => null } as unknown as Storage)).toBeNull()
  })

  it('persists the normalized active choice', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as unknown as Storage
    expect(saveBasemapPreference('stadia-dark', storage)).toBe(true)
    expect(values.get(BASEMAP_PREFERENCE_KEY)).toBe('openfreemap-dark')
  })
})
