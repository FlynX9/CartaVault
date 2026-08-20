import { describe, expect, it, vi } from 'vitest'

import { getJson, sendJson } from './client'
import { getGoogleMapsJavaScriptConfig, markGoogleMapsJavaScriptLoaded } from './googleSatellite'

vi.mock('./client', () => ({ getJson: vi.fn(), sendJson: vi.fn() }))

describe('Google Satellite Maps JavaScript integration', () => {
  it('requests only the browser configuration endpoint', async () => {
    vi.mocked(getJson).mockResolvedValue({ api_key: 'browser-key', language: 'fr', region: '', map_type: 'satellite' })
    await expect(getGoogleMapsJavaScriptConfig()).resolves.toMatchObject({ map_type: 'satellite' })
    expect(getJson).toHaveBeenCalledWith('/basemaps/google-satellite/maps-js/config', expect.any(URLSearchParams), undefined)
  })

  it('marks a direct Google renderer as loaded without creating a tile session', async () => {
    vi.mocked(sendJson).mockResolvedValue({ loaded: true })
    await expect(markGoogleMapsJavaScriptLoaded()).resolves.toEqual({ loaded: true })
    expect(sendJson).toHaveBeenCalledWith('/basemaps/google-satellite/maps-js/loaded', 'POST', { map_type: 'satellite' })
  })
})
