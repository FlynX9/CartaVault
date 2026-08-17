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
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'
import { API_BASE_URL } from '../../config'

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

function GoogleBasemapLayer({ basemapId, onTileError }: { basemapId: 'google-roadmap' | 'google-satellite'; onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void }) {
  const [session, setSession] = useState<{ tile_path: string; attribution: string; max_zoom: number } | null>(null)
  const sessionRequestRef = useRef<{ basemapId: typeof basemapId; promise: ReturnType<typeof createGoogleSatelliteSession> } | null>(null)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    let current = true
    const existing = sessionRequestRef.current
    const promise = existing?.basemapId === basemapId
      ? existing.promise
      : createGoogleSatelliteSession(basemapId === 'google-roadmap' ? 'roadmap' : 'satellite')
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
  useEffect(() => {
    const controller = new AbortController()
    const definition = stadiaStyles[basemap.id]
    if (!definition) return () => controller.abort()
    setUrl(null)
    void getStadiaBasemapConfig(controller.signal).then((config) => {
      const tilePath = config.tile_path
        .replace('{style}', definition.style)
        .replace('{extension}', definition.extension)
      if (!controller.signal.aborted) setUrl(tilePath.startsWith('http') ? tilePath : `${API_BASE_URL}${tilePath}`)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [basemap.id, basemap.url])
  if (!url) return null
  return <TileLayer key={`${basemap.id}:${url}`} url={url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} detectRetina eventHandlers={{ tileerror: () => onTileError(basemap.id) }} />
}

/** Switching the base layer never recreates the Leaflet MapContainer or its overlays. */
export function BasemapLayer({ basemapId, countryCode, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)

  if (basemap.kind === 'vector') {
    return <VectorBasemapLayer key={`${basemap.id}:${countryCode ?? ''}`} basemap={basemap} countryCode={countryCode} onTileError={onTileError} />
  }
  if (basemap.kind === 'google') return <GoogleBasemapLayer basemapId={basemap.id as 'google-roadmap' | 'google-satellite'} onTileError={onTileError} />
  if (basemap.id === 'mapbox-satellite') return <TileLayer key={basemap.id} url={`${API_BASE_URL}/basemaps/mapbox-satellite/tiles/{z}/{x}/{y}`} attribution={basemap.attribution} maxZoom={basemap.maxZoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileError(basemap.id) }} />
  if (basemap.requiresStadiaAuthentication) return <StadiaBasemapLayer basemap={basemap} onTileError={onTileError} />

  return (
    <TileLayer
      key={basemap.id}
      url={basemap.url}
      attribution={basemap.attribution}
      maxZoom={basemap.maxZoom}
      detectRetina
      eventHandlers={{ tileerror: () => onTileError(basemap.id) }}
    />
  )
}
