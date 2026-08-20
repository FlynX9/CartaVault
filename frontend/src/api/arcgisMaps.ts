import { sendJsonViaXhr } from './client'

export interface ArcGISBasemapSession {
  tile_url: string
  expires: string
  attribution: string
  max_zoom: number
}

let pendingSession: Promise<ArcGISBasemapSession> | null = null

export function createArcGISBasemapSession(): Promise<ArcGISBasemapSession> {
  if (pendingSession !== null) return pendingSession
  pendingSession = sendJsonViaXhr('/basemaps/arcgis-satellite/session', 'POST', {}) as Promise<ArcGISBasemapSession>
  void pendingSession.then(() => { pendingSession = null }, () => { pendingSession = null })
  return pendingSession
}
