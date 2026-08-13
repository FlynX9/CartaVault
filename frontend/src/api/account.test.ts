import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendJson } from './client'
import { startTotpSetup } from './account'
import type { TotpSetup } from '../types/account'

vi.mock('./client', () => ({
  getJson: vi.fn(),
  sendBodyWithoutResponse: vi.fn(),
  sendFormData: vi.fn(),
  sendJson: vi.fn(),
  sendWithoutResponse: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('startTotpSetup', () => {
  it('deduplicates concurrent setup requests triggered by React development checks', async () => {
    let resolveSetup!: (value: TotpSetup) => void
    const setup = new Promise<TotpSetup>((resolve) => { resolveSetup = resolve })
    vi.mocked(sendJson).mockReturnValue(setup)

    const first = startTotpSetup()
    const second = startTotpSetup()

    expect(first).toBe(second)
    expect(sendJson).toHaveBeenCalledOnce()
    expect(sendJson).toHaveBeenCalledWith('/account/security/totp/setup', 'POST', {})

    const value: TotpSetup = {
      secret: 'ABCDEFGHIJKLMNOP',
      provisioning_uri: 'otpauth://totp/CartaVault:test',
      qr_code_data_url: 'data:image/png;base64,AAAA',
      expires_at: '2026-08-13T10:00:00Z',
      issuer: 'CartaVault',
      account: 'test@example.test',
      digits: 6,
      period: 30,
    }
    resolveSetup(value)

    await expect(first).resolves.toEqual(value)
  })
})
