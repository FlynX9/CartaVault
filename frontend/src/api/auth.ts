import { getJson, sendJson, sendWithoutResponse, setCsrfToken } from './client'
import type { AuthUser, LoginPayload } from '../auth/authTypes'
import { isRecord, readBoolean, readDateTime, readString, readUuid } from './validation'

function parseUser(value: unknown): AuthUser {
  if (!isRecord(value)) throw new Error('La session renvoyée par l’API est invalide.')
  const lastLogin = value.last_login_at
  return {
    id: readUuid(value, 'id', 'Utilisateur'), email: readString(value, 'email', 'Utilisateur'),
    display_name: readString(value, 'display_name', 'Utilisateur'),
    is_admin: readBoolean(value, 'is_admin', 'Utilisateur'), is_active: readBoolean(value, 'is_active', 'Utilisateur'),
    created_at: readDateTime(value, 'created_at', 'Utilisateur'), updated_at: readDateTime(value, 'updated_at', 'Utilisateur'),
    last_login_at: typeof lastLogin === 'string' ? lastLogin : null,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    csrf_token: readString(value, 'csrf_token', 'Utilisateur'),
  }
}

export async function restoreSession(signal?: AbortSignal): Promise<AuthUser> {
  const user = parseUser(await getJson('/auth/me', new URLSearchParams(), signal))
  setCsrfToken(user.csrf_token)
  return user
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  const user = parseUser(await sendJson('/auth/login', 'POST', payload))
  setCsrfToken(user.csrf_token)
  return user
}

export async function logout(): Promise<void> {
  await sendWithoutResponse('/auth/logout', 'POST')
  setCsrfToken(null)
}
