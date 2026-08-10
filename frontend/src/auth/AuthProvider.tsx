import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, SESSION_EXPIRED_EVENT, setCsrfToken } from '../api/client'
import { login as loginRequest, logout as logoutRequest, restoreSession, verifyEmailMfaLogin, verifyTotpLogin } from '../api/auth'
import type { AuthUser, EmailMfaLoginChallenge, LoginPayload, TotpLoginChallenge } from './authTypes'
import { AuthContext } from './authContext'
import { clearOfflineDataForUser, getOfflineIdentity, isNetworkFailure, setOfflineIdentity } from '../pwa/offlineData'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const restored = await restoreSession()
      setOfflineIdentity(restored)
      setUser(restored)
    }
    catch (error) {
      if (isNetworkFailure(error)) {
        const offline = await getOfflineIdentity()
        if (offline) { setUser({ ...offline, is_active: true, created_at: '', updated_at: '', last_login_at: null, csrf_token: '' }); return }
      }
      if (!(error instanceof ApiError && error.status === 401)) throw error
      setCsrfToken(null); setUser(null)
    }
  }, [])
  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  useEffect(() => {
    const expire = () => { if (user) void clearOfflineDataForUser(user.id).catch(() => undefined); setOfflineIdentity(null); setCsrfToken(null); setUser(null) }
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
  }, [user])
  const login = useCallback(async (payload: LoginPayload): Promise<TotpLoginChallenge | EmailMfaLoginChallenge | null> => { const result = await loginRequest(payload); if ('requires_totp' in result || 'requires_email_mfa' in result) return result; setOfflineIdentity(result); setUser(result); return null }, [])
  const completeTotpLogin = useCallback(async (challengeToken: string, code: string, recovery = false) => { const authenticated = await verifyTotpLogin(challengeToken, code, recovery); setOfflineIdentity(authenticated); setUser(authenticated) }, [])
  const completeEmailMfaLogin = useCallback(async (challengeToken: string, code: string) => { const authenticated = await verifyEmailMfaLogin(challengeToken, code); setOfflineIdentity(authenticated); setUser(authenticated) }, [])
  const logout = useCallback(async () => { const current = user; try { await logoutRequest() } finally { if (current) void clearOfflineDataForUser(current.id).catch(() => undefined); setOfflineIdentity(null); setUser(null); setCsrfToken(null) } }, [user])
  const value = useMemo(() => ({ user, loading, login, completeTotpLogin, completeEmailMfaLogin, logout, refresh }), [user, loading, login, completeTotpLogin, completeEmailMfaLogin, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
