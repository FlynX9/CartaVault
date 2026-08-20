import { getJson, sendJson } from './client'

export type GoogleMapsJavaScriptMapType = 'satellite'
export interface GoogleMapsJavaScriptConfig { api_key: string; language: 'fr' | 'en'; region: string; map_type: GoogleMapsJavaScriptMapType }
export interface GoogleSatelliteAdminStatus {
  available: boolean
  settings: { maps_javascript_enabled: boolean }
  integration: 'google_maps_javascript'
  traffic: 'browser_to_google'
}

const empty = () => new URLSearchParams()

export const getGoogleMapsJavaScriptConfig = (mapType: GoogleMapsJavaScriptMapType = 'satellite', signal?: AbortSignal) => getJson('/basemaps/google-satellite/maps-js/config', new URLSearchParams({ map_type: mapType }), signal) as Promise<GoogleMapsJavaScriptConfig>
export const markGoogleMapsJavaScriptLoaded = (mapType: GoogleMapsJavaScriptMapType = 'satellite') => sendJson('/basemaps/google-satellite/maps-js/loaded', 'POST', { map_type: mapType }) as Promise<{ loaded: boolean }>
export const getGoogleSatelliteAdminStatus = (signal?: AbortSignal) => getJson('/admin/console/google-satellite', empty(), signal) as Promise<GoogleSatelliteAdminStatus>
export const saveGoogleSatelliteSettings = (settings: GoogleSatelliteAdminStatus['settings']) => sendJson('/admin/console/google-satellite/settings', 'PUT', settings) as Promise<GoogleSatelliteAdminStatus>
