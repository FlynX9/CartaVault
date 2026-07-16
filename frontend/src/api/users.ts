import { getJson, sendBodyWithoutResponse, sendJson } from './client'
import type { AuthUser } from '../auth/authTypes'

export interface AdminUser extends Omit<AuthUser, 'csrf_token'> { csrf_token?: never }
export interface CreateUserPayload { email: string; display_name: string; password: string; is_admin: boolean; is_active: boolean }
export interface UpdateUserPayload { display_name?: string; is_admin?: boolean; is_active?: boolean }

export async function getUsers(q?: string, signal?: AbortSignal): Promise<AdminUser[]> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  return getJson('/admin/users', params, signal) as Promise<AdminUser[]>
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  return sendJson('/admin/users', 'POST', payload) as Promise<AdminUser>
}

export async function updateUser(userId: string, payload: UpdateUserPayload): Promise<AdminUser> {
  return sendJson(`/admin/users/${encodeURIComponent(userId)}`, 'PATCH', payload) as Promise<AdminUser>
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  await sendBodyWithoutResponse(`/admin/users/${encodeURIComponent(userId)}/reset-password`, 'POST', { new_password: newPassword })
}
