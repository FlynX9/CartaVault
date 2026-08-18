import { API_BASE_URL } from '../config'
import { getJson, sendBodyWithoutResponse, sendFormData, sendJson, sendWithoutResponse } from './client'
import type { AccountPreferences, AccountProfile, AccountSession, PersonalApiKey, TotpRecoveryCodes, TotpSecurityStatus, TotpSetup } from '../types/account'

export const ACCOUNT_PREFERENCES_UPDATED_EVENT = 'cartavault:preferences-updated'
const PREFERENCES_CACHE_MS = 5_000
let preferencesRequest: Promise<AccountPreferences> | null = null
let cachedPreferences: { value: AccountPreferences; validUntil: number } | null = null

function observeWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    signal.addEventListener('abort', aborted, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}

function rememberPreferences(value: AccountPreferences): AccountPreferences {
  cachedPreferences = { value, validUntil: Date.now() + PREFERENCES_CACHE_MS }
  return value
}

export function clearAccountPreferencesCache(): void {
  cachedPreferences = null
  preferencesRequest = null
}

export const accountAvatarUrl = (url: string | null) => url ? `${API_BASE_URL}${url}` : null
export async function getAccountProfile(signal?: AbortSignal): Promise<AccountProfile> { return getJson('/account/profile', new URLSearchParams(), signal) as Promise<AccountProfile> }
export async function updateAccountProfile(display_name: string): Promise<AccountProfile> { return sendJson('/account/profile', 'PATCH', { display_name }) as Promise<AccountProfile> }
export async function changeAccountEmail(current_password: string, new_email: string): Promise<AccountProfile> { return sendJson('/account/change-email', 'POST', { current_password, new_email }) as Promise<AccountProfile> }
export async function changeAccountPassword(current_password: string, new_password: string, confirmation: string): Promise<void> { await sendBodyWithoutResponse('/account/change-password', 'POST', { current_password, new_password, confirmation }) }
export async function getAccountSessions(signal?: AbortSignal): Promise<AccountSession[]> { return getJson('/account/sessions', new URLSearchParams(), signal) as Promise<AccountSession[]> }
export async function revokeAccountSession(id: string): Promise<void> { await sendWithoutResponse(`/account/sessions/${encodeURIComponent(id)}`, 'DELETE') }
export async function revokeOtherAccountSessions(): Promise<void> { await sendWithoutResponse('/account/sessions/revoke-others', 'POST') }
export async function getTotpStatus(): Promise<TotpSecurityStatus> { return getJson('/account/security/totp', new URLSearchParams()) as Promise<TotpSecurityStatus> }
export async function getEmailMfaStatus(): Promise<{ enabled: boolean; verified_at: string | null; available: boolean }> { return getJson('/account/security/email-mfa', new URLSearchParams()) as Promise<{ enabled: boolean; verified_at: string | null; available: boolean }> }
export async function startEmailMfaSetup(current_password: string): Promise<{ challenge_token: string }> { return sendJson('/account/security/email-mfa/setup', 'POST', { current_password }) as Promise<{ challenge_token: string }> }
export async function confirmEmailMfaSetup(challenge_token: string, code: string): Promise<void> { await sendJson('/account/security/email-mfa/confirm', 'POST', { challenge_token, code }) }
export async function disableEmailMfa(current_password: string): Promise<void> { await sendBodyWithoutResponse('/account/security/email-mfa/disable', 'POST', { current_password }) }
let pendingTotpSetup: Promise<TotpSetup> | null = null

export function startTotpSetup(): Promise<TotpSetup> {
  if (pendingTotpSetup) return pendingTotpSetup

  pendingTotpSetup = (sendJson('/account/security/totp/setup', 'POST', {}) as Promise<TotpSetup>)
    .finally(() => { pendingTotpSetup = null })
  return pendingTotpSetup
}
export async function confirmTotpSetup(code: string): Promise<TotpRecoveryCodes> { return sendJson('/account/security/totp/confirm', 'POST', { code }) as Promise<TotpRecoveryCodes> }
export async function regenerateTotpRecoveryCodes(current_password: string, code: string): Promise<TotpRecoveryCodes> { return sendJson('/account/security/totp/recovery-codes/regenerate', 'POST', { current_password, code }) as Promise<TotpRecoveryCodes> }
export async function disableTotp(current_password: string, code: string): Promise<void> { await sendBodyWithoutResponse('/account/security/totp/disable', 'POST', { current_password, code }) }
export async function uploadAccountAvatar(file: File): Promise<{ avatar_url: string }> { const data = new FormData(); data.append('file', file); return sendFormData('/account/avatar', 'POST', data) as Promise<{ avatar_url: string }> }
export async function deleteAccountAvatar(): Promise<void> { await sendWithoutResponse('/account/avatar', 'DELETE') }
export async function deleteOwnAccount(current_password: string, confirmation: string, acknowledged: boolean): Promise<void> { await sendBodyWithoutResponse('/account', 'DELETE', { current_password, confirmation, acknowledged }) }
export function getAccountPreferences(signal?: AbortSignal): Promise<AccountPreferences> {
  if (cachedPreferences && cachedPreferences.validUntil > Date.now()) {
    return observeWithAbort(Promise.resolve(cachedPreferences.value), signal)
  }
  if (!preferencesRequest) {
    preferencesRequest = (getJson('/account/preferences', new URLSearchParams()) as Promise<AccountPreferences>)
      .then(rememberPreferences)
      .finally(() => { preferencesRequest = null })
  }
  return observeWithAbort(preferencesRequest, signal)
}
export async function updateAccountPreferences(preferences: AccountPreferences): Promise<AccountPreferences> { return rememberPreferences(await sendJson('/account/preferences', 'PUT', preferences) as AccountPreferences) }
export async function resetAccountPreferences(): Promise<AccountPreferences> { return rememberPreferences(await sendJson('/account/preferences/reset', 'POST', {}) as AccountPreferences) }
export async function getPersonalApiKeys(signal?: AbortSignal): Promise<PersonalApiKey[]> { return getJson('/account/api-keys', new URLSearchParams(), signal) as Promise<PersonalApiKey[]> }
export async function createPersonalApiKey(data: { name: string; provider: 'google' | 'stadia' | 'mapbox' | 'openrouteservice'; api_key: string }): Promise<PersonalApiKey> { return sendJson('/account/api-keys', 'POST', data) as Promise<PersonalApiKey> }
export async function updatePersonalApiKey(id: string, data: { name?: string; api_key?: string }): Promise<PersonalApiKey> { return sendJson(`/account/api-keys/${encodeURIComponent(id)}`, 'PATCH', data) as Promise<PersonalApiKey> }
export async function verifyPersonalApiKey(id: string): Promise<PersonalApiKey> { return sendJson(`/account/api-keys/${encodeURIComponent(id)}/verify`, 'POST', {}) as Promise<PersonalApiKey> }
export async function deletePersonalApiKey(id: string): Promise<void> { await sendWithoutResponse(`/account/api-keys/${encodeURIComponent(id)}`, 'DELETE') }
