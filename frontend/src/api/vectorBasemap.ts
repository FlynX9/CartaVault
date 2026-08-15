import { getJson } from './client'
import { API_BASE_URL } from '../config'

export interface CartaVaultVectorConfig {
  enabled: boolean
  available: boolean
  country_code: string | null
  country_name: string | null
  state: 'not_installed' | 'downloading' | 'generating' | 'validating' | 'ready' | 'update_available' | 'error' | 'unsupported'
  phase: string | null
  error_code: string | null
  error_message: string | null
  archive_url: string | null
  glyphs_url: string
  version: string
  min_zoom: number
  max_zoom: number
  offline_min_zoom: number
  offline_max_zoom: number
  offline_padding_km: number
  offline_max_tiles: number
  attribution: string
}

const cached = new Map<string, CartaVaultVectorConfig>()
const STORAGE_KEY = 'cartavault.vector-basemap-config'

export async function getCartaVaultVectorConfig(signal?: AbortSignal, refresh = false, countryCode?: string, purpose: 'status' | 'online' | 'offline' = 'status'): Promise<CartaVaultVectorConfig> {
  const key = countryCode?.toUpperCase() ?? 'none'
  if (cached.has(key) && !refresh) return cached.get(key)!
  try {
    const parameters = new URLSearchParams()
    if (countryCode) parameters.set('country_code', countryCode)
    parameters.set('purpose', purpose)
    const response = await getJson('/basemaps/cartavault/config', parameters, signal) as CartaVaultVectorConfig
    const payload = { ...response, archive_url: response.archive_url ? `${API_BASE_URL}${response.archive_url}` : null, glyphs_url: `${API_BASE_URL}${response.glyphs_url}` }
    cached.set(key, payload)
    window.localStorage.setItem(`${STORAGE_KEY}.${key}`, JSON.stringify(payload))
    return payload
  } catch (error) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(`${STORAGE_KEY}.${key}`) ?? '') as CartaVaultVectorConfig
      if (stored?.version && stored.archive_url && stored.country_code === key) { cached.set(key, stored); return stored }
    } catch { /* No previously verified archive configuration. */ }
    throw error
  }
}

export function clearCartaVaultVectorConfigCache(): void { cached.clear() }
