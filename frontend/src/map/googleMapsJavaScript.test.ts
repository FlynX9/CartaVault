import { beforeEach, describe, expect, it, vi } from 'vitest'

const { importLibrary, setOptions } = vi.hoisted(() => ({ importLibrary: vi.fn(), setOptions: vi.fn() }))

vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary, setOptions }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  importLibrary.mockResolvedValue({ Map: vi.fn() })
})

describe('Google Maps JavaScript loader', () => {
  it('loads the official SDK once and reuses it for the same browser key', async () => {
    const { loadGoogleMapsJavaScript } = await import('./googleMapsJavaScript')

    const first = loadGoogleMapsJavaScript('browser-key', 'fr')
    const second = loadGoogleMapsJavaScript('browser-key', 'fr')
    await Promise.all([first, second])

    expect(first).toBe(second)
    expect(setOptions).toHaveBeenCalledOnce()
    expect(setOptions).toHaveBeenCalledWith(expect.objectContaining({ key: 'browser-key', language: 'fr', authReferrerPolicy: 'origin' }))
    expect(importLibrary).toHaveBeenCalledOnce()
    expect(importLibrary).toHaveBeenCalledWith('maps')
  })

  it('refuses to expose a different key without a page reload', async () => {
    const { loadGoogleMapsJavaScript } = await import('./googleMapsJavaScript')
    await loadGoogleMapsJavaScript('first-key', 'en')

    await expect(loadGoogleMapsJavaScript('second-key', 'en')).rejects.toThrow('Rechargez la page')
    expect(setOptions).toHaveBeenCalledOnce()
  })

  it('records created and destroyed map instances for cost diagnostics', async () => {
    const { getGoogleMapInstanceMetrics, recordGoogleMapInstanceCreated, recordGoogleMapInstanceDestroyed } = await import('./googleMapsJavaScript')
    recordGoogleMapInstanceCreated()
    recordGoogleMapInstanceDestroyed()
    expect(getGoogleMapInstanceMetrics()).toEqual({ created: 1, destroyed: 1, active: 0 })
  })

  it('forwards Google browser-key authentication failures to the map adapter', async () => {
    const { loadGoogleMapsJavaScript, onGoogleMapsAuthenticationFailure } = await import('./googleMapsJavaScript')
    const listener = vi.fn()
    const unsubscribe = onGoogleMapsAuthenticationFailure(listener)
    await loadGoogleMapsJavaScript('restricted-key', 'fr')

    window.gm_authFailure?.()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
