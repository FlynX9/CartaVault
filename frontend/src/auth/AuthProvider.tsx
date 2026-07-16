import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, SESSION_EXPIRED_EVENT, setCsrfToken } from '../api/client'
import { login as loginRequest, logout as logoutRequest, restoreSession } from '../api/auth'
import type { AuthUser, LoginPayload } from './authTypes'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { setUser(await restoreSession()) }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; setCsrfToken(null); setUser(null) }
  }, [])
  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  useEffect(() => {
    const expire = () => { setCsrfToken(null); setUser(null) }
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
  }, [])
  const login = useCallback(async (payload: LoginPayload) => { setUser(await loginRequest(payload)) }, [])
  const logout = useCallback(async () => { try { await logoutRequest() } finally { setUser(null); setCsrfToken(null) } }, [])
  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
