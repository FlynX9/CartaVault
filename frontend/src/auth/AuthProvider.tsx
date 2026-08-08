import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, SESSION_EXPIRED_EVENT, setCsrfToken } from '../api/client'
import { login as loginRequest, logout as logoutRequest, restoreSession } from '../api/auth'
import type { AuthUser, LoginPayload } from './authTypes'
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
  const login = useCallback(async (payload: LoginPayload) => { const authenticated = await loginRequest(payload); setOfflineIdentity(authenticated); setUser(authenticated) }, [])
  const logout = useCallback(async () => { const current = user; try { await logoutRequest() } finally { if (current) void clearOfflineDataForUser(current.id).catch(() => undefined); setOfflineIdentity(null); setUser(null); setCsrfToken(null) } }, [user])
  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
