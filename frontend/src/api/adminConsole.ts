import { getJson, sendJson, sendWithoutResponse } from './client'
import type { AdminRole, AdminUserPage, AdminUserState, CredentialStatus, InstanceHealth, QuotaLimits, QuotaOverview, UserQuota } from '../types/adminConsole'

const empty = () => new URLSearchParams()

export function getAdminUsers(filters: { q?: string; role?: AdminRole | ''; state?: AdminUserState | ''; page?: number; pageSize?: number }, signal?: AbortSignal): Promise<AdminUserPage> {
  const params = empty()
  if (filters.q) params.set('q', filters.q)
  if (filters.role) params.set('role', filters.role)
  if (filters.state) params.set('state', filters.state)
  params.set('page', String(filters.page ?? 1)); params.set('page_size', String(filters.pageSize ?? 25))
  return getJson('/admin/console/users', params, signal) as Promise<AdminUserPage>
}
export function updateAdminUser(id: string, payload: { role?: AdminRole; is_active?: boolean }) {
  return sendJson(`/admin/console/users/${encodeURIComponent(id)}`, 'PATCH', payload)
}
export function getAdminCredentials(signal?: AbortSignal) { return getJson('/admin/console/credentials', empty(), signal) as Promise<CredentialStatus[]> }
export function saveResendCredential(value: string) { return sendJson('/admin/console/credentials/resend', 'PUT', { value }) as Promise<CredentialStatus> }
export function verifyResendCredential() { return sendJson('/admin/console/credentials/resend/verify', 'POST', {}) as Promise<CredentialStatus> }
export function deleteResendCredential() { return sendWithoutResponse('/admin/console/credentials/resend', 'DELETE') }
export function getAdminQuotas(signal?: AbortSignal) { return getJson('/admin/console/quotas', empty(), signal) as Promise<QuotaOverview> }
export function saveAdminQuotas(payload: QuotaLimits) { return sendJson('/admin/console/quotas', 'PUT', payload) as Promise<QuotaLimits> }
export function saveUserQuota(userId: string, payload: QuotaLimits) { return sendJson(`/admin/console/quotas/users/${encodeURIComponent(userId)}`, 'PATCH', payload) as Promise<UserQuota> }
export function getInstanceHealth(signal?: AbortSignal) { return getJson('/admin/console/instance', empty(), signal) as Promise<InstanceHealth> }
export function refreshInstanceHealth() { return sendJson('/admin/console/instance/refresh', 'POST', {}) as Promise<InstanceHealth> }
