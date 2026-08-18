import '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

import { getBasemap, type BasemapId, type RasterBasemapDefinition, type VectorBasemapDefinition } from '../../map/basemaps'
import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { createGoogleSatelliteSession } from '../../api/googleSatellite'
import { ApiError } from '../../api/client'
import { getStadiaBasemapConfig } from '../../api/stadiaMaps'
import { createMapboxTileSession } from '../../api/mapboxMaps'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'
import { API_BASE_URL } from '../../config'
import { GoogleMapsJavaScriptBasemap } from './GoogleMapsJavaScriptBasemap'

interface BasemapLayerProps {
  basemapId: BasemapId
  countryCode?: string | null
  onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void
}

function VectorBasemapLayer({ basemap, countryCode, onTileError }: { basemap: VectorBasemapDefinition; countryCode?: string | null; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const map = useMap()
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError

  useEffect(() => {
    const controller = new AbortController()
    let layer: L.MaplibreGLLayer | null = null
    let mapLibreErrorHandler: (() => void) | null = null

    void (async () => {
      const configured = await getCartaVaultVectorConfig(controller.signal, true, countryCode ?? undefined, 'offline')
      const offlineVersion = navigator.onLine === false ? await getOfflineBasemapVersion() : null
      const config = offlineVersion ? { ...configured, version: offlineVersion, available: true } : configured
      if (config.available && config.archive_url) {
        configureCartaVaultProtocol(config)
        return loadCartaVaultStyle(basemap.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || basemap.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom })
      }
      if (!controller.signal.aborted) onTileErrorRef.current(basemap.id, true)
      return null
    })().then((style) => {
        if (controller.signal.aborted || style === null) return
        layer = L.maplibreGL({ style, interactive: false, attributionControl: false })
        layer.addTo(map)
        map.attributionControl?.addAttribution(basemap.attribution)
        mapLibreErrorHandler = () => onTileErrorRef.current(basemap.id)
        layer.getMaplibreMap().on('error', mapLibreErrorHandler)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) onTileErrorRef.current(basemap.id, true)
      })

    return () => {
      controller.abort()
      if (layer !== null) {
        const mapLibreMap = layer.getMaplibreMap()
        if (mapLibreErrorHandler !== null && mapLibreMap !== null) {
          mapLibreMap.off('error', mapLibreErrorHandler)
        }
        if (map.hasLayer(layer)) layer.removeFrom(map)
        map.attributionControl?.removeAttribution(basemap.attribution)
      }
    }
  }, [basemap, countryCode, map])

  return null
}

function GoogleBasemapLayer({ basemapId, onTileError }: { basemapId: 'google-satellite-tiles'; onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void }) {
  const [session, setSession] = useState<{ tile_path: string; attribution: string; max_zoom: number } | null>(null)
  const sessionRequestRef = useRef<{ basemapId: typeof basemapId; promise: ReturnType<typeof createGoogleSatelliteSession> } | null>(null)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    let current = true
    const existing = sessionRequestRef.current
    const promise = existing?.basemapId === basemapId
      ? existing.promise
      : createGoogleSatelliteSession('satellite')
    sessionRequestRef.current = { basemapId, promise }
    void promise.then((value) => { if (current) setSession(value) }).catch((error: unknown) => {
      if (current) onTileErrorRef.current(basemapId, true, error instanceof Error ? error.message : undefined, error instanceof ApiError ? error.code ?? undefined : undefined)
    })
    return () => { current = false }
  }, [basemapId])
  if (!session) return null
  return <TileLayer key={basemapId} url={`${API_BASE_URL}${session.tile_path}`} attribution={session.attribution} maxZoom={session.max_zoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileErrorRef.current(basemapId) }} />
}

const stadiaStyles: Partial<Record<BasemapId, { style: string; extension: 'png' | 'jpg' }>> = {
  'stadia-light': { style: 'alidade_smooth', extension: 'png' },
  'stadia-dark': { style: 'alidade_smooth_dark', extension: 'png' },
  satellite: { style: 'alidade_satellite', extension: 'jpg' },
}

function StadiaBasemapLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [sessionGeneration, setSessionGeneration] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const definition = stadiaStyles[basemap.id]
    if (!definition) return () => controller.abort()
    setUrl(null)
    const capability = basemap.id === 'satellite' ? 'satellite_basemap' : 'classic_basemap'
    void getStadiaBasemapConfig(capability, controller.signal).then((config) => {
      const tilePath = config.tile_path
        .replace('{style}', definition.style)
        .replace('{extension}', definition.extension)
      if (!controller.signal.aborted) setUrl(tilePath.startsWith('http') ? tilePath : `${API_BASE_URL}${tilePath}`)
      if (config.expires && !controller.signal.aborted) {
        const refreshIn = Math.max(30_000, Date.parse(config.expires) - Date.now() - 60_000)
        refreshTimer = setTimeout(() => setSessionGeneration((value) => value + 1), refreshIn)
      }
    }).catch(() => undefined)
    return () => {
      controller.abort()
      if (refreshTimer !== null) clearTimeout(refreshTimer)
    }
  }, [basemap.id, basemap.url, sessionGeneration])
  if (!url) return null
  // Stadia's {r} URL token already requests a native @2x tile. Enabling
  // Leaflet's detectRetina at the same time halves the logical tile size and
  // downloads four times as many @2x images for the same viewport.
  return <TileLayer key={`${basemap.id}:${url}`} url={url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileError(basemap.id) }} />
}

function MapboxBasemapLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const [session, setSession] = useState<{ tile_path: string; attribution: string; max_zoom: number } | null>(null)
  const [sessionGeneration, setSessionGeneration] = useState(0)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    let current = true
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    void createMapboxTileSession()
      .then((value) => {
        if (!current) return
        setSession(value)
        const refreshIn = Math.max(30_000, Date.parse(value.expires) - Date.now() - 60_000)
        refreshTimer = setTimeout(() => setSessionGeneration((generation) => generation + 1), refreshIn)
      })
      .catch(() => { if (current) onTileErrorRef.current(basemap.id, true) })
    return () => {
      current = false
      if (refreshTimer !== null) clearTimeout(refreshTimer)
    }
  }, [basemap.id, sessionGeneration])
  if (!session) return null
  return <TileLayer key={basemap.id} url={`${API_BASE_URL}${session.tile_path}`} attribution={basemap.attribution} maxZoom={session.max_zoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileErrorRef.current(basemap.id) }} />
}

/** Switching the base layer never recreates the Leaflet MapContainer or its overlays. */
export function BasemapLayer({ basemapId, countryCode, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)
  const googleMapsBasemapId = basemapId === 'google-roadmap' ? 'google-roadmap' : 'google-satellite'
  const googleMapsActive = basemapId === 'google-roadmap' || basemapId === 'google-satellite'

  const googleMapsLayer = <GoogleMapsJavaScriptBasemap key={googleMapsBasemapId} active={googleMapsActive} basemapId={googleMapsBasemapId} mapType={googleMapsBasemapId === 'google-roadmap' ? 'roadmap' : 'satellite'} onError={onTileError} />

  if (basemap.kind === 'vector') {
    return <>{googleMapsLayer}<VectorBasemapLayer key={`${basemap.id}:${countryCode ?? ''}`} basemap={basemap} countryCode={countryCode} onTileError={onTileError} /></>
  }
  if (basemap.id === 'google-satellite') return googleMapsLayer
  if (basemap.id === 'google-satellite-tiles') return <>{googleMapsLayer}<GoogleBasemapLayer basemapId="google-satellite-tiles" onTileError={onTileError} /></>
  if (basemap.kind === 'google') return googleMapsLayer
  if (basemap.id === 'mapbox-satellite') return <>{googleMapsLayer}<MapboxBasemapLayer basemap={basemap} onTileError={onTileError} /></>
  if (basemap.requiresStadiaAuthentication) return <>{googleMapsLayer}<StadiaBasemapLayer basemap={basemap} onTileError={onTileError} /></>

  return (
    <>{googleMapsLayer}<TileLayer
      key={basemap.id}
      url={basemap.url}
      attribution={basemap.attribution}
      maxZoom={basemap.maxZoom}
      detectRetina
      eventHandlers={{ tileerror: () => onTileError(basemap.id) }}
    /></>
  )
}
