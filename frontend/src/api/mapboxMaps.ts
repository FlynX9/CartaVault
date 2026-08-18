import { sendJsonViaXhr } from './client'

export interface MapboxTileSession {
  tile_path: string
  expires: string
  attribution: string
  max_zoom: number
}

let pendingSession: Promise<MapboxTileSession> | null = null

export function createMapboxTileSession(): Promise<MapboxTileSession> {
  if (pendingSession !== null) return pendingSession
  pendingSession = sendJsonViaXhr('/basemaps/mapbox-satellite/session', 'POST', {}) as Promise<MapboxTileSession>
  void pendingSession.then(
    () => { pendingSession = null },
    () => { pendingSession = null },
  )
  return pendingSession
}
