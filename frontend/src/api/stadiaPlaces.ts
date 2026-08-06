import { getJson, sendJson } from './client'

export interface StadiaPlacesCredentialStatus {
  configured: boolean
  last4: string | null
  verified: boolean
  verified_at: string | null
  last_used_at: string | null
  last_error_code: string | null
}

export interface StadiaPlacesConfig { personal_key_active: boolean; api_key: string | null }

const empty = () => new URLSearchParams()
export const getStadiaPlacesCredential = (signal?: AbortSignal) => getJson('/account/integrations/stadia-places', empty(), signal) as Promise<StadiaPlacesCredentialStatus>
export const storeStadiaPlacesCredential = (apiKey: string) => sendJson('/account/integrations/stadia-places', 'PUT', { api_key: apiKey }) as Promise<StadiaPlacesCredentialStatus>
export const verifyStadiaPlacesCredential = () => sendJson('/account/integrations/stadia-places/verify', 'POST', {}) as Promise<StadiaPlacesCredentialStatus>
export const deleteStadiaPlacesCredential = (currentPassword: string) => sendJson('/account/integrations/stadia-places', 'DELETE', { current_password: currentPassword }) as Promise<{ deleted: boolean }>
export const getStadiaPlacesConfig = (signal?: AbortSignal) => getJson('/account/integrations/stadia-places/config', empty(), signal) as Promise<StadiaPlacesConfig>
