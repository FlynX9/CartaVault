import { getJson, sendBodyWithoutResponse, sendJson } from './client'

export interface RegistrationRequest {
  id: string; email: string; display_name: string; status: 'pending' | 'approved' | 'rejected'; created_at: string
  reviewed_at: string | null; notification_sent_at: string | null; notification_error_code: string | null
}
export interface EmailSettingsStatus { configured: boolean; last4: string | null }

export async function register(email: string, password: string, confirmation: string): Promise<{ status: string; message: string }> {
  return sendJson('/auth/register', 'POST', { email, password, confirmation }) as Promise<{ status: string; message: string }>
}
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return sendJson('/auth/password-reset/request', 'POST', { email }) as Promise<{ message: string }>
}
export async function confirmPasswordReset(token: string, password: string, confirmation: string): Promise<void> {
  await sendBodyWithoutResponse('/auth/password-reset/confirm', 'POST', { token, password, confirmation })
}
export async function getRegistrationRequests(signal?: AbortSignal): Promise<RegistrationRequest[]> {
  return getJson('/admin/registration-requests', new URLSearchParams(), signal) as Promise<RegistrationRequest[]>
}
export async function reviewRegistration(id: string, decision: 'approve' | 'reject'): Promise<RegistrationRequest> {
  return sendJson(`/admin/registration-requests/${encodeURIComponent(id)}/${decision}`, 'POST', {}) as Promise<RegistrationRequest>
}
export async function getEmailSettings(signal?: AbortSignal): Promise<EmailSettingsStatus> {
  return getJson('/admin/email-settings', new URLSearchParams(), signal) as Promise<EmailSettingsStatus>
}
export async function saveEmailSettings(apiKey: string): Promise<EmailSettingsStatus> {
  return sendJson('/admin/email-settings', 'PUT', { api_key: apiKey }) as Promise<EmailSettingsStatus>
}
