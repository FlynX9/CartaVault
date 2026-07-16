import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { LoginPage } from '../pages/LoginPage'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="auth-loading" aria-live="polite">Chargement de CartaVault…</main>
  if (user === null) return <LoginPage />
  return children
}
