import { API_BASE_URL } from '../config'
import { getJson, sendBodyWithoutResponse, sendFormData, sendJson, sendWithoutResponse } from './client'
import type { AccountPreferences, AccountProfile, AccountSession, GooglePlacesCredentialDeletion, GooglePlacesCredentialStatus, GoogleRoutesCredentialDeletion, GoogleRoutesCredentialStatus, OpenRouteServiceCredentialDeletion, OpenRouteServiceCredentialStatus, TotpRecoveryCodes, TotpSecurityStatus, TotpSetup } from '../types/account'

export const ACCOUNT_PREFERENCES_UPDATED_EVENT = 'cartavault:preferences-updated'

export const accountAvatarUrl = (url: string | null) => url ? `${API_BASE_URL}${url}` : null
export async function getAccountProfile(signal?: AbortSignal): Promise<AccountProfile> { return getJson('/account/profile', new URLSearchParams(), signal) as Promise<AccountProfile> }
export async function updateAccountProfile(display_name: string): Promise<AccountProfile> { return sendJson('/account/profile', 'PATCH', { display_name }) as Promise<AccountProfile> }
export async function changeAccountEmail(current_password: string, new_email: string): Promise<AccountProfile> { return sendJson('/account/change-email', 'POST', { current_password, new_email }) as Promise<AccountProfile> }
export async function changeAccountPassword(current_password: string, new_password: string, confirmation: string): Promise<void> { await sendBodyWithoutResponse('/account/change-password', 'POST', { current_password, new_password, confirmation }) }
export async function getAccountSessions(signal?: AbortSignal): Promise<AccountSession[]> { return getJson('/account/sessions', new URLSearchParams(), signal) as Promise<AccountSession[]> }
export async function revokeAccountSession(id: string): Promise<void> { await sendWithoutResponse(`/account/sessions/${encodeURIComponent(id)}`, 'DELETE') }
export async function revokeOtherAccountSessions(): Promise<void> { await sendWithoutResponse('/account/sessions/revoke-others', 'POST') }
export async function getTotpStatus(): Promise<TotpSecurityStatus> { return getJson('/account/security/totp', new URLSearchParams()) as Promise<TotpSecurityStatus> }
export async function startTotpSetup(): Promise<TotpSetup> { return sendJson('/account/security/totp/setup', 'POST', {}) as Promise<TotpSetup> }
export async function confirmTotpSetup(code: string): Promise<TotpRecoveryCodes> { return sendJson('/account/security/totp/confirm', 'POST', { code }) as Promise<TotpRecoveryCodes> }
export async function regenerateTotpRecoveryCodes(current_password: string, code: string): Promise<TotpRecoveryCodes> { return sendJson('/account/security/totp/recovery-codes/regenerate', 'POST', { current_password, code }) as Promise<TotpRecoveryCodes> }
export async function disableTotp(current_password: string, code: string): Promise<void> { await sendBodyWithoutResponse('/account/security/totp/disable', 'POST', { current_password, code }) }
export async function uploadAccountAvatar(file: File): Promise<{ avatar_url: string }> { const data = new FormData(); data.append('file', file); return sendFormData('/account/avatar', 'POST', data) as Promise<{ avatar_url: string }> }
export async function deleteAccountAvatar(): Promise<void> { await sendWithoutResponse('/account/avatar', 'DELETE') }
export async function deleteOwnAccount(current_password: string, confirmation: string, acknowledged: boolean): Promise<void> { await sendBodyWithoutResponse('/account', 'DELETE', { current_password, confirmation, acknowledged }) }
export async function getAccountPreferences(signal?: AbortSignal): Promise<AccountPreferences> { return getJson('/account/preferences', new URLSearchParams(), signal) as Promise<AccountPreferences> }
export async function updateAccountPreferences(preferences: AccountPreferences): Promise<AccountPreferences> { return sendJson('/account/preferences', 'PUT', preferences) as Promise<AccountPreferences> }
export async function resetAccountPreferences(): Promise<AccountPreferences> { return sendJson('/account/preferences/reset', 'POST', {}) as Promise<AccountPreferences> }
export async function getGoogleRoutesCredential(signal?: AbortSignal): Promise<GoogleRoutesCredentialStatus> { return getJson('/account/integrations/google-routes', new URLSearchParams(), signal) as Promise<GoogleRoutesCredentialStatus> }
export async function storeGoogleRoutesCredential(apiKey: string): Promise<GoogleRoutesCredentialStatus> { return sendJson('/account/integrations/google-routes', 'PUT', { api_key: apiKey }) as Promise<GoogleRoutesCredentialStatus> }
export async function verifyGoogleRoutesCredential(): Promise<GoogleRoutesCredentialStatus> { return sendJson('/account/integrations/google-routes/verify', 'POST', {}) as Promise<GoogleRoutesCredentialStatus> }
export async function deleteGoogleRoutesCredential(currentPassword: string): Promise<GoogleRoutesCredentialDeletion> { return sendJson('/account/integrations/google-routes', 'DELETE', { current_password: currentPassword }) as Promise<GoogleRoutesCredentialDeletion> }
export async function getGooglePlacesCredential(signal?: AbortSignal): Promise<GooglePlacesCredentialStatus> { return getJson('/account/integrations/google-places', new URLSearchParams(), signal) as Promise<GooglePlacesCredentialStatus> }
export async function storeGooglePlacesCredential(apiKey: string): Promise<GooglePlacesCredentialStatus> { return sendJson('/account/integrations/google-places', 'PUT', { api_key: apiKey }) as Promise<GooglePlacesCredentialStatus> }
export async function verifyGooglePlacesCredential(): Promise<GooglePlacesCredentialStatus> { return sendJson('/account/integrations/google-places/verify', 'POST', {}) as Promise<GooglePlacesCredentialStatus> }
export async function deleteGooglePlacesCredential(currentPassword: string): Promise<GooglePlacesCredentialDeletion> { return sendJson('/account/integrations/google-places', 'DELETE', { current_password: currentPassword }) as Promise<GooglePlacesCredentialDeletion> }
export async function getOpenRouteServiceCredential(signal?: AbortSignal): Promise<OpenRouteServiceCredentialStatus> { return getJson('/account/integrations/openrouteservice', new URLSearchParams(), signal) as Promise<OpenRouteServiceCredentialStatus> }
export async function storeOpenRouteServiceCredential(apiKey: string): Promise<OpenRouteServiceCredentialStatus> { return sendJson('/account/integrations/openrouteservice', 'PUT', { api_key: apiKey }) as Promise<OpenRouteServiceCredentialStatus> }
export async function verifyOpenRouteServiceCredential(): Promise<OpenRouteServiceCredentialStatus> { return sendJson('/account/integrations/openrouteservice/verify', 'POST', {}) as Promise<OpenRouteServiceCredentialStatus> }
export async function deleteOpenRouteServiceCredential(currentPassword: string): Promise<OpenRouteServiceCredentialDeletion> { return sendJson('/account/integrations/openrouteservice', 'DELETE', { current_password: currentPassword }) as Promise<OpenRouteServiceCredentialDeletion> }
