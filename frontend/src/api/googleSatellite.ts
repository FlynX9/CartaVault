import { getJson, sendJson, sendJsonViaXhr } from './client'

export interface GoogleSatelliteStatus { available: boolean; warning_level: 0 | 50 | 80 | 95 }
export interface GoogleSatelliteSession { tile_path: string; expires: string | null; attribution: string; max_zoom: number }
export interface GoogleMapsJavaScriptConfig { api_key: string; language: 'fr' | 'en'; region: string; map_type: 'satellite' }
export interface GoogleSatelliteAdminStatus {
  available: boolean; warning_level: number
  settings: { enabled: boolean; maps_javascript_enabled?: boolean; daily_soft_limit: number; monthly_soft_limit: number; auto_disable_percent: number; repeated_error_limit: number; consecutive_errors: number; disabled_reason: string | null }
  usage: { sessions_today: number; tiles_started_today: number; tiles_completed_today: number; tiles_failed_today: number; tiles_cancelled_today: number; tiles_started_month: number }
  quota: { scope: 'instance'; daily_limit: number; monthly_limit: number; daily_reset_at: string; monthly_reset_at: string; blocked: boolean; reason: string | null }
  authoritative_monitoring: { connected: boolean; source: 'backend_proxy'; console_url: string; notice: string }
}

const empty = () => new URLSearchParams()
const GOOGLE_SESSION_DEDUPLICATION_MS = 30_000
const googleSessionRequests = new Map<'roadmap' | 'satellite', { promise: Promise<GoogleSatelliteSession>; validUntil: number }>()

export const getGoogleSatelliteStatus = (signal?: AbortSignal) => getJson('/basemaps/google-satellite/status', empty(), signal) as Promise<GoogleSatelliteStatus>
export const getGoogleMapsJavaScriptConfig = (signal?: AbortSignal) => getJson('/basemaps/google-satellite/maps-js/config', empty(), signal) as Promise<GoogleMapsJavaScriptConfig>
export const markGoogleMapsJavaScriptLoaded = () => sendJson('/basemaps/google-satellite/maps-js/loaded', 'POST', {}) as Promise<{ loaded: boolean }>
export const createGoogleSatelliteSession = (mapType: 'roadmap' | 'satellite' = 'satellite'): Promise<GoogleSatelliteSession> => {
  const existing = googleSessionRequests.get(mapType)
  if (existing && existing.validUntil > Date.now()) return existing.promise
  const promise = sendJsonViaXhr('/basemaps/google-satellite/session', 'POST', { map_type: mapType }) as Promise<GoogleSatelliteSession>
  const entry = { promise, validUntil: Date.now() + GOOGLE_SESSION_DEDUPLICATION_MS }
  googleSessionRequests.set(mapType, entry)
  void promise.catch(() => { if (googleSessionRequests.get(mapType) === entry) googleSessionRequests.delete(mapType) })
  return promise
}
export const getGoogleSatelliteAdminStatus = (signal?: AbortSignal) => getJson('/admin/console/google-satellite', empty(), signal) as Promise<GoogleSatelliteAdminStatus>
export const saveGoogleSatelliteSettings = (settings: GoogleSatelliteAdminStatus['settings']) => sendJson('/admin/console/google-satellite/settings', 'PUT', settings) as Promise<GoogleSatelliteAdminStatus>
export const resetGoogleSatelliteErrors = () => sendJson('/admin/console/google-satellite/reset-errors', 'POST', {}) as Promise<GoogleSatelliteAdminStatus>
