import { getJson, sendBodyWithoutResponse, sendJson } from './client'

export interface RegistrationRequest {
  id: string; email: string; display_name: string; status: 'awaiting_email' | 'pending' | 'approved' | 'rejected' | 'expired'; created_at: string
  reviewed_at: string | null; notification_sent_at: string | null; notification_error_code: string | null
  email_verified_at: string | null; verification_expires_at: string | null
}
export interface EmailSettingsStatus { configured: boolean; last4: string | null }
export interface PublicRegistrationSettings { enabled: boolean }
export interface PublicRegistrationStatus extends PublicRegistrationSettings { terms_version: string }

export async function getPublicRegistrationStatus(signal?: AbortSignal): Promise<PublicRegistrationStatus> {
  return getJson('/auth/registration-status', new URLSearchParams(), signal) as Promise<PublicRegistrationStatus>
}

export async function register(email: string, password: string, confirmation: string, termsAccepted: boolean, locale: 'fr' | 'en' = 'fr'): Promise<{ status: string; message: string }> {
  return sendJson('/auth/register', 'POST', { email, password, confirmation, terms_accepted: termsAccepted, website: '', locale }) as Promise<{ status: string; message: string }>
}
export async function verifyRegistrationEmail(token: string): Promise<{ status: string; message: string }> {
  return sendJson('/auth/register/verify', 'POST', { token }) as Promise<{ status: string; message: string }>
}
export async function resendRegistrationVerification(email: string, locale: 'fr' | 'en' = 'fr'): Promise<{ message: string }> {
  return sendJson('/auth/register/resend-verification', 'POST', { email, locale }) as Promise<{ message: string }>
}
export async function requestPasswordReset(email: string, locale: 'fr' | 'en' = 'fr'): Promise<{ message: string }> {
  return sendJson('/auth/password-reset/request', 'POST', { email, locale }) as Promise<{ message: string }>
}
export async function confirmPasswordReset(token: string, password: string, confirmation: string): Promise<void> {
  await sendBodyWithoutResponse('/auth/password-reset/confirm', 'POST', { token, password, confirmation })
}
export async function getRegistrationRequests(signal?: AbortSignal): Promise<RegistrationRequest[]> {
  return getJson('/admin/registration-requests', new URLSearchParams(), signal) as Promise<RegistrationRequest[]>
}
export async function getPublicRegistrationSettings(signal?: AbortSignal): Promise<PublicRegistrationSettings> {
  return getJson('/admin/public-registration', new URLSearchParams(), signal) as Promise<PublicRegistrationSettings>
}
export async function updatePublicRegistrationSettings(enabled: boolean): Promise<PublicRegistrationSettings> {
  return sendJson('/admin/public-registration', 'PUT', { enabled }) as Promise<PublicRegistrationSettings>
}
export async function reviewRegistration(id: string, decision: 'approve' | 'reject', quotaProfileId?: string): Promise<RegistrationRequest> {
  return sendJson(`/admin/registration-requests/${encodeURIComponent(id)}/${decision}`, 'POST', decision === 'approve' ? { quota_profile_id: quotaProfileId ?? null } : {}) as Promise<RegistrationRequest>
}
export async function getEmailSettings(signal?: AbortSignal): Promise<EmailSettingsStatus> {
  return getJson('/admin/email-settings', new URLSearchParams(), signal) as Promise<EmailSettingsStatus>
}
export async function saveEmailSettings(apiKey: string): Promise<EmailSettingsStatus> {
  return sendJson('/admin/email-settings', 'PUT', { api_key: apiKey }) as Promise<EmailSettingsStatus>
}
