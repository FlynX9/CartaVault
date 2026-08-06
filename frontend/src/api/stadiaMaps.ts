import { getJson, sendJson } from './client'

const empty = () => new URLSearchParams()

export interface StadiaMapsCredentialStatus {
  configured: boolean
  last4: string | null
  verified: boolean
  verified_at: string | null
  last_used_at: string | null
  last_error_code: string | null
}

export interface StadiaBasemapConfig {
  personal_key_active: boolean
  tile_url: string | null
}

export const getStadiaMapsCredential = (signal?: AbortSignal) => getJson('/account/integrations/stadia-maps', empty(), signal) as Promise<StadiaMapsCredentialStatus>
export const storeStadiaMapsCredential = (apiKey: string) => sendJson('/account/integrations/stadia-maps', 'PUT', { api_key: apiKey }) as Promise<StadiaMapsCredentialStatus>
export const verifyStadiaMapsCredential = () => sendJson('/account/integrations/stadia-maps/verify', 'POST', {}) as Promise<StadiaMapsCredentialStatus>
export const deleteStadiaMapsCredential = (currentPassword: string) => sendJson('/account/integrations/stadia-maps', 'DELETE', { current_password: currentPassword }) as Promise<{ deleted: boolean }>
export const getStadiaBasemapConfig = (signal?: AbortSignal) => getJson('/basemaps/stadia/config', empty(), signal) as Promise<StadiaBasemapConfig>
