import { afterEach, describe, expect, it, vi } from 'vitest'

import { login } from './auth'
import { setCsrfToken } from './client'

afterEach(() => { setCsrfToken(null); vi.unstubAllGlobals() })

describe('auth API', () => {
  it('keeps an email MFA challenge distinct from an authenticated session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      requires_email_mfa: true,
      challenge_token: 'email-mfa-challenge-token-with-enough-entropy',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))))

    await expect(login({ email: 'owner@example.test', password: 'password' })).resolves.toEqual({
      requires_email_mfa: true,
      challenge_token: 'email-mfa-challenge-token-with-enough-entropy',
    })
  })
})
