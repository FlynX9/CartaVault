import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendJsonViaXhr } from './client'

vi.mock('./client', () => ({
  getJson: vi.fn(),
  sendJson: vi.fn(),
  sendJsonViaXhr: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('Google satellite sessions', () => {
  it('deduplicates concurrent and immediate repeated session requests', async () => {
    const session = { tile_path: '/tiles/{z}/{x}/{y}', expires: null, attribution: '© Google', max_zoom: 22 }
    vi.mocked(sendJsonViaXhr).mockResolvedValue(session)
    const { createGoogleSatelliteSession } = await import('./googleSatellite')

    const first = createGoogleSatelliteSession('satellite')
    const second = createGoogleSatelliteSession('satellite')

    await expect(Promise.all([first, second])).resolves.toEqual([session, session])
    expect(sendJsonViaXhr).toHaveBeenCalledOnce()
    await expect(createGoogleSatelliteSession('satellite')).resolves.toEqual(session)
    expect(sendJsonViaXhr).toHaveBeenCalledOnce()
  })

  it('allows a failed session request to be retried', async () => {
    vi.mocked(sendJsonViaXhr).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ tile_path: '/tiles/{z}/{x}/{y}', expires: null, attribution: '© Google', max_zoom: 22 })
    const { createGoogleSatelliteSession } = await import('./googleSatellite')

    await expect(createGoogleSatelliteSession('satellite')).rejects.toThrow('Unavailable')
    await expect(createGoogleSatelliteSession('satellite')).resolves.toMatchObject({ attribution: '© Google' })
    expect(sendJsonViaXhr).toHaveBeenCalledTimes(2)
  })
})
