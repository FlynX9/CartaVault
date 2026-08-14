import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadCartaVaultStyle } from './maplibreStyle'

afterEach(() => vi.unstubAllGlobals())

describe('loadCartaVaultStyle', () => {
  it('keeps the existing online TileJSON fallback when no PMTiles archive is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 8,
      sources: { openmaptiles: { type: 'vector', url: 'https://default.invalid/planet' } },
      glyphs: 'https://default.invalid/fonts/{fontstack}/{range}.pbf',
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }],
    }), { status: 200 })))

    const style = await loadCartaVaultStyle('/map-styles/cartavault-light.json', 'https://tiles.example.test/planet', 'https://tiles.example.test/fonts/{fontstack}/{range}.pbf')

    expect(fetch).toHaveBeenCalledWith('/map-styles/cartavault-light.json', { signal: undefined })
    expect(style.sources.openmaptiles).toMatchObject({ type: 'vector', url: 'https://tiles.example.test/planet' })
    expect('tiles' in style.sources.openmaptiles).toBe(false)
    expect(style.glyphs).toBe('https://tiles.example.test/fonts/{fontstack}/{range}.pbf')
  })

  it('uses explicit PMTiles protocol tiles and zoom limits when configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 8,
      sources: { openmaptiles: { type: 'vector', url: 'about:blank' } },
      layers: [],
    }), { status: 200 })))

    const style = await loadCartaVaultStyle('/map-styles/cartavault-light.json', 'cartavault://v1/{z}/{x}/{y}', '/fonts/{fontstack}/{range}.pbf', undefined, { min: 5, max: 14 })
    expect(style.sources.openmaptiles).toMatchObject({ type: 'vector', tiles: ['cartavault://v1/{z}/{x}/{y}'], minzoom: 5, maxzoom: 14 })
    expect('url' in style.sources.openmaptiles).toBe(false)
  })

  it('rejects malformed or unavailable local styles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(loadCartaVaultStyle('/invalid.json', 'tiles', 'glyphs')).rejects.toThrow('Invalid MapLibre style document')
  })
})
