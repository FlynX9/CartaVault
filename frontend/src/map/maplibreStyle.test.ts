import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadCartaVaultStyle } from './maplibreStyle'

afterEach(() => vi.unstubAllGlobals())

describe('loadCartaVaultStyle', () => {
  it('keeps the local style while replacing deployable OpenFreeMap endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 8,
      sources: { openmaptiles: { type: 'vector', url: 'https://default.invalid/planet' } },
      glyphs: 'https://default.invalid/fonts/{fontstack}/{range}.pbf',
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }],
    }), { status: 200 })))

    const style = await loadCartaVaultStyle('/map-styles/cartavault-light.json', 'https://tiles.example.test/planet', 'https://tiles.example.test/fonts/{fontstack}/{range}.pbf')

    expect(fetch).toHaveBeenCalledWith('/map-styles/cartavault-light.json', { signal: undefined })
    expect(style.sources.openmaptiles).toMatchObject({ type: 'vector', url: 'https://tiles.example.test/planet' })
    expect(style.glyphs).toBe('https://tiles.example.test/fonts/{fontstack}/{range}.pbf')
  })

  it('rejects malformed or unavailable local styles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(loadCartaVaultStyle('/invalid.json', 'tiles', 'glyphs')).rejects.toThrow('Invalid MapLibre style document')
  })
})
