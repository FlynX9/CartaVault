import { afterEach, describe, expect, it, vi } from 'vitest'

import { getJson, sendJson } from './client'
import { API_MUTATION_FAILURE_EVENT, API_MUTATION_SUCCESS_EVENT } from './mutationEvents'

afterEach(() => vi.unstubAllGlobals())

describe('API errors', () => {
  it('bypasses the browser cache for authenticated API reads', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)

    await getJson('/trips/trip-1', new URLSearchParams())

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/trips/trip-1'), expect.objectContaining({ cache: 'no-store' }))
  })

  it('maps FastAPI 422 details to form fields', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: [{ loc: ['body', 'latitude'], msg: 'Input should be less than 90' }],
    }), { status: 422, headers: { 'Content-Type': 'application/json' } }))))

    await expect(sendJson('/places', 'POST', {})).rejects.toMatchObject({
      status: 422,
      fieldErrors: { latitude: 'Input should be less than 90' },
    })
  })

  it('exposes structured conflict codes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: { code: 'PLACE_OUTSIDE_MAP_COUNTRY', message: 'Point hors pays.' },
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))))

    await expect(sendJson('/places', 'POST', {})).rejects.toMatchObject({
      status: 409,
      code: 'PLACE_OUTSIDE_MAP_COUNTRY',
      message: 'Point hors pays.',
    })
  })

  it('announces successful mutations after consuming the response', async () => {
    const succeeded = vi.fn()
    window.addEventListener(API_MUTATION_SUCCESS_EVENT, succeeded)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))))

    await sendJson('/places', 'POST', {})

    expect(succeeded).toHaveBeenCalledOnce()
    expect((succeeded.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ method: 'POST', path: '/places' })
    window.removeEventListener(API_MUTATION_SUCCESS_EVENT, succeeded)
  })

  it('announces failed mutations without reporting success', async () => {
    const succeeded = vi.fn()
    const failed = vi.fn()
    window.addEventListener(API_MUTATION_SUCCESS_EVENT, succeeded)
    window.addEventListener(API_MUTATION_FAILURE_EVENT, failed)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: 'Refusé' }), { status: 400, headers: { 'Content-Type': 'application/json' } }))))

    await expect(sendJson('/places', 'POST', {})).rejects.toMatchObject({ status: 400 })

    expect(succeeded).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
    window.removeEventListener(API_MUTATION_SUCCESS_EVENT, succeeded)
    window.removeEventListener(API_MUTATION_FAILURE_EVENT, failed)
  })
})
