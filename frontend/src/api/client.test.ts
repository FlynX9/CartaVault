import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendJson } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('API errors', () => {
  it('maps FastAPI 422 details to form fields', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: [{ loc: ['body', 'latitude'], msg: 'Input should be less than 90' }],
    }), { status: 422, headers: { 'Content-Type': 'application/json' } }))))

    await expect(sendJson('/places', 'POST', {})).rejects.toMatchObject({
      status: 422,
      fieldErrors: { latitude: 'Input should be less than 90' },
    })
  })
})
