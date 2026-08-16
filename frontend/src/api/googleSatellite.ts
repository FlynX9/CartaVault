import { getJson, sendBodyWithoutResponse, sendJson } from './client'

export interface GoogleSatelliteStatus { available: boolean; warning_level: 0 | 50 | 80 | 95 }
export interface GoogleSatelliteSession { tile_path: string; expires: string | null; attribution: string; max_zoom: number }
export interface GoogleSatelliteAdminStatus {
  available: boolean; warning_level: number
  settings: { enabled: boolean; daily_soft_limit: number; monthly_soft_limit: number; auto_disable_percent: number; repeated_error_limit: number; consecutive_errors: number; disabled_reason: string | null }
  usage: { sessions_today: number; tiles_started_today: number; tiles_completed_today: number; tiles_failed_today: number; tiles_cancelled_today: number; tiles_started_month: number }
  authoritative_monitoring: { connected: boolean; console_url: string; notice: string }
}

const empty = () => new URLSearchParams()
export const getGoogleSatelliteStatus = (signal?: AbortSignal) => getJson('/basemaps/google-satellite/status', empty(), signal) as Promise<GoogleSatelliteStatus>
export const createGoogleSatelliteSession = (signal?: AbortSignal) => sendJson('/basemaps/google-satellite/session', 'POST', {}, signal) as Promise<GoogleSatelliteSession>
export const reportGoogleSatelliteUsage = (event: Record<string, number>) => sendBodyWithoutResponse('/basemaps/google-satellite/usage', 'POST', event)
export const getGoogleSatelliteAdminStatus = (signal?: AbortSignal) => getJson('/admin/console/google-satellite', empty(), signal) as Promise<GoogleSatelliteAdminStatus>
export const saveGoogleSatelliteSettings = (settings: GoogleSatelliteAdminStatus['settings']) => sendJson('/admin/console/google-satellite/settings', 'PUT', settings) as Promise<GoogleSatelliteAdminStatus>
export const resetGoogleSatelliteErrors = () => sendJson('/admin/console/google-satellite/reset-errors', 'POST', {}) as Promise<GoogleSatelliteAdminStatus>
