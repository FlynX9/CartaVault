import { API_BASE_URL } from '../config'
import { getJson, sendBodyWithoutResponse, sendFormData, sendJson, sendWithoutResponse } from './client'
import type { AccountProfile, AccountSession } from '../types/account'

export const accountAvatarUrl = (url: string | null) => url ? `${API_BASE_URL}${url}` : null
export async function getAccountProfile(signal?: AbortSignal): Promise<AccountProfile> { return getJson('/account/profile', new URLSearchParams(), signal) as Promise<AccountProfile> }
export async function updateAccountProfile(display_name: string): Promise<AccountProfile> { return sendJson('/account/profile', 'PATCH', { display_name }) as Promise<AccountProfile> }
export async function changeAccountEmail(current_password: string, new_email: string): Promise<AccountProfile> { return sendJson('/account/change-email', 'POST', { current_password, new_email }) as Promise<AccountProfile> }
export async function changeAccountPassword(current_password: string, new_password: string, confirmation: string): Promise<void> { await sendBodyWithoutResponse('/account/change-password', 'POST', { current_password, new_password, confirmation }) }
export async function getAccountSessions(signal?: AbortSignal): Promise<AccountSession[]> { return getJson('/account/sessions', new URLSearchParams(), signal) as Promise<AccountSession[]> }
export async function revokeAccountSession(id: string): Promise<void> { await sendWithoutResponse(`/account/sessions/${encodeURIComponent(id)}`, 'DELETE') }
export async function revokeOtherAccountSessions(): Promise<void> { await sendWithoutResponse('/account/sessions/revoke-others', 'POST') }
export async function uploadAccountAvatar(file: File): Promise<{ avatar_url: string }> { const data = new FormData(); data.append('file', file); return sendFormData('/account/avatar', 'POST', data) as Promise<{ avatar_url: string }> }
export async function deleteAccountAvatar(): Promise<void> { await sendWithoutResponse('/account/avatar', 'DELETE') }
export async function deleteOwnAccount(current_password: string, confirmation: string, acknowledged: boolean): Promise<void> { await sendBodyWithoutResponse('/account', 'DELETE', { current_password, confirmation, acknowledged }) }
