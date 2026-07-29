import { API_BASE_URL } from '../config'
import { ApiError } from './client'

export type SetupCheck = {
  key: string
  label: string
  status: 'ready' | 'warning' | 'error'
  detail: string
}

export type SetupStatus = {
  required: boolean
  locked: boolean
  checks: SetupCheck[]
}

export type SetupCompletion = {
  administrator: {
    email: string
    display_name: string
    password: string
    password_confirmation: string
    language: 'en' | 'fr'
    timezone: string
  }
  instance: {
    instance_name: string
    public_url: string
    default_language: 'en' | 'fr'
    timezone: string
    public_registration_enabled: boolean
    maximum_upload_megabytes: number
    support_address: string | null
  }
  email: {
    provider: 'none' | 'resend'
    api_key: string | null
    sender_address: string | null
    sender_name: string
    reply_to_address: string | null
  }
  mapping: {
    default_basemap: 'cartavault-light' | 'cartavault-dark' | 'osm-standard' | 'satellite'
    default_routing_engine: 'osrm' | 'google_routes'
  }
}

async function setupRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { 'X-CartaVault-Setup-Token': options.token } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  })
  if (!response.ok) {
    let message = 'Initial setup request failed.'
    try {
      const payload = await response.json() as { detail?: string | Array<{ msg?: string }> }
      if (typeof payload.detail === 'string') message = payload.detail
      else if (Array.isArray(payload.detail)) message = payload.detail.map((item) => item.msg).filter(Boolean).join(' ')
    } catch {
      // The status code still provides a safe diagnostic when no JSON body exists.
    }
    throw new ApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export function getSetupStatus(signal?: AbortSignal): Promise<SetupStatus> {
  return setupRequest('/setup/status', { signal })
}

export function verifySetupToken(token: string): Promise<{ valid: boolean }> {
  return setupRequest('/setup/verify-token', { method: 'POST', token })
}

export function completeInitialSetup(
  token: string,
  payload: SetupCompletion,
): Promise<{ completed: boolean; administrator_email: string }> {
  return setupRequest('/setup/complete', { method: 'POST', token, body: payload })
}
