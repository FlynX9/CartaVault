import { createContext } from 'react'

import type { AuthUser, LoginPayload, TotpLoginChallenge } from './authTypes'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (payload: LoginPayload) => Promise<TotpLoginChallenge | null>
  completeTotpLogin: (challengeToken: string, code: string, recovery?: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
