import { getJson, sendJson, sendWithoutResponse } from './client'
import type { AdminRole, AdminUserPage, AdminUserState, CredentialStatus, EffectiveQuota, InstanceHealth, QuotaLimits, QuotaProfile, QuotaRegistryItem } from '../types/adminConsole'

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
export function getQuotaProfiles(signal?: AbortSignal) { return getJson('/admin/quota-profiles', empty(), signal) as Promise<QuotaProfile[]> }
export function getQuotaRegistry(signal?: AbortSignal) { return getJson('/admin/quota-registry', empty(), signal) as Promise<QuotaRegistryItem[]> }
export function createQuotaProfile(payload: { name: string; description: string | null; is_active: boolean; limits: QuotaLimits }) { return sendJson('/admin/quota-profiles', 'POST', payload) as Promise<QuotaProfile> }
export function updateQuotaProfile(id: string, payload: Partial<{ name: string; description: string | null; is_active: boolean; limits: QuotaLimits }>) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}`, 'PATCH', payload) as Promise<QuotaProfile> }
export function duplicateQuotaProfile(id: string) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}/duplicate`, 'POST', {}) as Promise<QuotaProfile> }
export function setDefaultQuotaProfile(id: string) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}/set-default`, 'POST', {}) as Promise<QuotaProfile> }
export function archiveQuotaProfile(id: string) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}/archive`, 'POST', {}) as Promise<QuotaProfile> }
export function deleteQuotaProfile(id: string) { return sendWithoutResponse(`/admin/quota-profiles/${encodeURIComponent(id)}`, 'DELETE') }
export function assignUserQuotaProfile(userId: string, profileId: string) { return sendJson(`/admin/users/${encodeURIComponent(userId)}/quota-profile`, 'PUT', { quota_profile_id: profileId }) as Promise<EffectiveQuota> }
export function getUserQuotas(userId: string, signal?: AbortSignal) { return getJson(`/admin/users/${encodeURIComponent(userId)}/quotas`, empty(), signal) as Promise<EffectiveQuota> }
export function getInstanceHealth(signal?: AbortSignal) { return getJson('/admin/console/instance', empty(), signal) as Promise<InstanceHealth> }
export function refreshInstanceHealth() { return sendJson('/admin/console/instance/refresh', 'POST', {}) as Promise<InstanceHealth> }
