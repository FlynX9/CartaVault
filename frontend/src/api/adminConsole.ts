import { getJson, sendJson, sendWithoutResponse } from './client'
import type { AdminRole, AdminUserPage, AdminUserState, CredentialStatus, EffectiveQuota, InstanceHealth, InstanceLogLevel, InstanceLogPage, QuotaLimits, QuotaProfile, QuotaRegistryItem } from '../types/adminConsole'

export interface MediaUploadSettings { max_upload_megabytes: number; max_image_dimension: number }
export interface BackgroundTaskResult { task_id: string; status: string }
export interface SaasSettings { enabled: boolean }
export interface InstanceLogRetentionSettings { retention_days: number }

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
export function getMediaUploadSettings(signal?: AbortSignal) { return getJson('/admin/console/media/settings', empty(), signal) as Promise<MediaUploadSettings> }
export function saveMediaUploadSettings(maxUploadMegabytes: number, maxImageDimension: number) { return sendJson('/admin/console/media/settings', 'PUT', { max_upload_megabytes: maxUploadMegabytes, max_image_dimension: maxImageDimension }) as Promise<MediaUploadSettings> }
export function optimizeStoredMedia() { return sendJson('/admin/console/media/optimize', 'POST', {}) as Promise<BackgroundTaskResult> }
export function getBackgroundTask(taskId: string, signal?: AbortSignal) { return getJson(`/tasks/${encodeURIComponent(taskId)}`, empty(), signal) as Promise<{ status: string; progress_current: number; progress_total: number; percent: number; progress_message: string | null; result: Record<string, unknown> | null; error_message: string | null }> }
export function cancelBackgroundTask(taskId: string) { return sendWithoutResponse(`/tasks/${encodeURIComponent(taskId)}`, 'DELETE') }
export function getSaasSettings(signal?: AbortSignal) { return getJson('/admin/console/saas/settings', empty(), signal) as Promise<SaasSettings> }
export function saveSaasSettings(enabled: boolean) { return sendJson('/admin/console/saas/settings', 'PUT', { enabled }) as Promise<SaasSettings> }
export function getInstanceLogRetention(signal?: AbortSignal) { return getJson('/admin/console/instance/log-retention', empty(), signal) as Promise<InstanceLogRetentionSettings> }
export function saveInstanceLogRetention(retentionDays: number) { return sendJson('/admin/console/instance/log-retention', 'PUT', { retention_days: retentionDays }) as Promise<InstanceLogRetentionSettings> }
export function getQuotaProfiles(signal?: AbortSignal) { return getJson('/admin/quota-profiles', empty(), signal) as Promise<QuotaProfile[]> }
export function getQuotaRegistry(signal?: AbortSignal) { return getJson('/admin/quota-registry', empty(), signal) as Promise<QuotaRegistryItem[]> }
export function createQuotaProfile(payload: { name: string; description: string | null; is_active: boolean; limits: QuotaLimits }) { return sendJson('/admin/quota-profiles', 'POST', payload) as Promise<QuotaProfile> }
export function updateQuotaProfile(id: string, payload: Partial<{ name: string; description: string | null; is_active: boolean; limits: QuotaLimits }>) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}`, 'PATCH', payload) as Promise<QuotaProfile> }
export function duplicateQuotaProfile(id: string) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}/duplicate`, 'POST', {}) as Promise<QuotaProfile> }
export function setDefaultQuotaProfile(id: string) { return sendJson(`/admin/quota-profiles/${encodeURIComponent(id)}/set-default`, 'POST', {}) as Promise<QuotaProfile> }
export function deleteQuotaProfile(id: string) { return sendWithoutResponse(`/admin/quota-profiles/${encodeURIComponent(id)}`, 'DELETE') }
export function assignUserQuotaProfile(userId: string, profileId: string) { return sendJson(`/admin/users/${encodeURIComponent(userId)}/quota-profile`, 'PUT', { quota_profile_id: profileId }) as Promise<EffectiveQuota> }
export function getUserQuotas(userId: string, signal?: AbortSignal) { return getJson(`/admin/users/${encodeURIComponent(userId)}/quotas`, empty(), signal) as Promise<EffectiveQuota> }
export function getInstanceHealth(signal?: AbortSignal) { return getJson('/admin/console/instance', empty(), signal) as Promise<InstanceHealth> }
export function refreshInstanceHealth() { return sendJson('/admin/console/instance/refresh', 'POST', {}) as Promise<InstanceHealth> }
export function getInstanceLogs(filters: { level?: InstanceLogLevel | ''; component?: string; search?: string; limit?: number; before?: number | null; order?: 'newest' | 'oldest' }, signal?: AbortSignal) {
  const params = empty()
  if (filters.level) params.set('level', filters.level)
  if (filters.component) params.set('component', filters.component)
  if (filters.search) params.set('search', filters.search)
  params.set('limit', String(filters.limit ?? 100))
  params.set('order', filters.order ?? 'newest')
  if (filters.before) params.set('before', String(filters.before))
  return getJson('/admin/console/instance/logs', params, signal) as Promise<InstanceLogPage>
}
