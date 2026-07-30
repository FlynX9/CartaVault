import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="auth-loading" aria-live="polite">Chargement de CartaVault…</main>
  if (user === null) return <Navigate to="/login" replace />
  return children
}
