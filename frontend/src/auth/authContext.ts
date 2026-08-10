import { createContext } from 'react'

import type { AuthUser, EmailMfaLoginChallenge, LoginPayload, TotpLoginChallenge } from './authTypes'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (payload: LoginPayload) => Promise<TotpLoginChallenge | EmailMfaLoginChallenge | null>
  completeTotpLogin: (challengeToken: string, code: string, recovery?: boolean) => Promise<void>
  completeEmailMfaLogin: (challengeToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
