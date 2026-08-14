import { getJson } from './client'
import { API_BASE_URL } from '../config'

export interface CartaVaultVectorConfig {
  available: boolean
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

let cached: CartaVaultVectorConfig | null = null
const STORAGE_KEY = 'cartavault.vector-basemap-config'

export async function getCartaVaultVectorConfig(signal?: AbortSignal, refresh = false): Promise<CartaVaultVectorConfig> {
  if (cached && !refresh) return cached
  try {
    const response = await getJson('/basemaps/cartavault/config', new URLSearchParams(), signal) as CartaVaultVectorConfig
    const payload = { ...response, archive_url: response.archive_url ? `${API_BASE_URL}${response.archive_url}` : null, glyphs_url: `${API_BASE_URL}${response.glyphs_url}` }
    cached = payload
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return payload
  } catch (error) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as CartaVaultVectorConfig
      if (stored?.version && stored.archive_url) { cached = stored; return stored }
    } catch { /* No previously verified archive configuration. */ }
    throw error
  }
}

export function clearCartaVaultVectorConfigCache(): void { cached = null }
