import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getJson, sendJson } from './client'
import { clearAccountPreferencesCache, getAccountPreferences, startTotpSetup } from './account'
import type { AccountPreferences, TotpSetup } from '../types/account'

vi.mock('./client', () => ({
  getJson: vi.fn(),
  sendBodyWithoutResponse: vi.fn(),
  sendFormData: vi.fn(),
  sendJson: vi.fn(),
  sendWithoutResponse: vi.fn(),
}))

beforeEach(() => { vi.clearAllMocks(); clearAccountPreferencesCache() })

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

describe('getAccountPreferences', () => {
  it('deduplicates concurrent startup consumers', async () => {
    let resolvePreferences!: (value: AccountPreferences) => void
    const request = new Promise<AccountPreferences>((resolve) => { resolvePreferences = resolve })
    vi.mocked(getJson).mockReturnValue(request)
    const value = {
      language: 'fr', default_theme: 'system', preferred_basemap: 'osm', density: 'compact', startup_panel: 'maps',
      timezone: 'Europe/Paris', trash_retention_days: 30, photo_markers_enabled: false,
      onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm' }, places: { provider: 'stadia' },
      basemaps: { classic_provider: 'osm', satellite_provider: 'none' },
    } satisfies AccountPreferences

    const consumers = Array.from({ length: 4 }, () => getAccountPreferences())
    expect(getJson).toHaveBeenCalledOnce()
    resolvePreferences(value)
    await expect(Promise.all(consumers)).resolves.toEqual([value, value, value, value])
    await expect(getAccountPreferences()).resolves.toEqual(value)
    expect(getJson).toHaveBeenCalledOnce()
  })
})
