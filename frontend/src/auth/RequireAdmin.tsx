import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="auth-loading" aria-live="polite">Chargement de CartaVault…</main>
  if (!user?.is_admin) return <Navigate to="/" replace />
  return children
}
