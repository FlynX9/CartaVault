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
import { getCartaVaultVectorConfig, type CartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'
import { API_BASE_URL } from '../../config'
import { GoogleMapsJavaScriptBasemap } from './GoogleMapsJavaScriptBasemap'

interface BasemapLayerProps {
  basemapId: BasemapId
  countryCode?: string | null
  onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void
}

function vectorRendererErrorCode(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('glyph') || normalized.includes('/fonts/') || normalized.includes('.pbf')) return 'GLYPHS_MISSING'
  if (normalized.includes('pmtiles') || normalized.includes('range') || normalized.includes('archive')) return 'PMTILES_UNREACHABLE'
  return 'MAPLIBRE_RENDER_ERROR'
}

function styleErrorCode(message: string): string {
  return message.includes('Invalid MapLibre style') || message.includes('must define the openmaptiles') ? 'STYLE_INVALID' : 'STYLE_MISSING'
}

function VectorBasemapLayer({ basemap, countryCode, onTileError }: { basemap: VectorBasemapDefinition; countryCode?: string | null; onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void }) {
  const map = useMap()
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  const basemapRef = useRef(basemap)
  basemapRef.current = basemap
  const layerRef = useRef<L.MaplibreGLLayer | null>(null)
  const configRef = useRef<CartaVaultVectorConfig | null>(null)
  const appliedStyleRef = useRef<BasemapId | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let mapLibreErrorHandler: ((event: unknown) => void) | null = null

    void (async () => {
      const purpose = navigator.onLine === false ? 'offline' : 'online'
      let configured: CartaVaultVectorConfig
      try {
        configured = await getCartaVaultVectorConfig(controller.signal, true, countryCode ?? undefined, purpose)
      } catch (error) {
        if (!controller.signal.aborted) {
          const reason = error instanceof Error ? error.message : 'La configuration CartaVault Vector est inaccessible.'
          console.error('[Basemap] CartaVault Vector configuration failed', { country: countryCode, purpose, reason })
          onTileErrorRef.current(basemapRef.current.id, true, reason, 'VECTOR_CONFIG_UNREACHABLE')
        }
        return null
      }
      const offlineVersion = navigator.onLine === false ? await getOfflineBasemapVersion() : null
      const config = offlineVersion ? { ...configured, version: offlineVersion, available: true } : configured
      console.info('[Basemap] CartaVault Vector availability', {
        requested: basemapRef.current.id,
        country: countryCode,
        purpose,
        available: config.available,
        state: config.state,
        reason: config.error_code,
      })
      if (!config.available || !config.archive_url) {
        if (!controller.signal.aborted) {
          const reason = config.error_message ?? `Le fond CartaVault n'est pas disponible pour ${countryCode ?? 'ce pays'}.`
          onTileErrorRef.current(basemapRef.current.id, true, reason, config.error_code ?? 'BASEMAP_NOT_INSTALLED')
        }
        return null
      }
      configRef.current = config
      configureCartaVaultProtocol(config)
      const selected = basemapRef.current
      try {
        const style = await loadCartaVaultStyle(selected.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || selected.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom })
        return { style, selected }
      } catch (error) {
        if (!controller.signal.aborted) {
          const reason = error instanceof Error ? error.message : 'Le style CartaVault est inaccessible.'
          console.error('[Basemap] CartaVault style failed', { style: selected.styleUrl, reason })
          onTileErrorRef.current(selected.id, true, reason, styleErrorCode(reason))
        }
        return null
      }
    })().then((result) => {
        if (controller.signal.aborted || result === null) return
        const layer = L.maplibreGL({ style: result.style, interactive: false, attributionControl: false })
        layerRef.current = layer
        appliedStyleRef.current = result.selected.id
        layer.addTo(map)
        map.attributionControl?.addAttribution(result.selected.attribution)
        mapLibreErrorHandler = (event: unknown) => {
          const reason = (event as { error?: Error }).error?.message ?? 'Erreur du moteur MapLibre.'
          const selectedId = basemapRef.current.id
          console.error('[Basemap] MapLibre renderer failed', { requested: selectedId, country: countryCode, reason })
          onTileErrorRef.current(selectedId, false, reason, vectorRendererErrorCode(reason))
        }
        layer.getMaplibreMap().on('error', mapLibreErrorHandler)
      })

    return () => {
      controller.abort()
      const layer = layerRef.current
      if (layer !== null) {
        const mapLibreMap = layer.getMaplibreMap()
        if (mapLibreErrorHandler !== null && mapLibreMap !== null) {
          mapLibreMap.off('error', mapLibreErrorHandler)
        }
        if (map.hasLayer(layer)) layer.removeFrom(map)
        map.attributionControl?.removeAttribution(basemapRef.current.attribution)
      }
      layerRef.current = null
      configRef.current = null
      appliedStyleRef.current = null
    }
  }, [countryCode, map])

  useEffect(() => {
    const layer = layerRef.current
    const config = configRef.current
    if (layer === null || config === null || appliedStyleRef.current === basemap.id) return
    const controller = new AbortController()
    void loadCartaVaultStyle(basemap.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || basemap.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom })
      .then((style) => {
        if (controller.signal.aborted || layerRef.current !== layer) return
        layer.getMaplibreMap().setStyle(style)
        appliedStyleRef.current = basemap.id
        console.info('[Basemap] CartaVault theme applied', { theme: basemap.id, style: basemap.styleUrl, country: countryCode })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const reason = error instanceof Error ? error.message : 'Le style CartaVault est inaccessible.'
        console.error('[Basemap] CartaVault theme switch failed', { theme: basemap.id, style: basemap.styleUrl, reason })
        onTileErrorRef.current(basemap.id, true, reason, styleErrorCode(reason))
      })
    return () => controller.abort()
  }, [basemap, countryCode])

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
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
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
    }).catch(() => {
      if (!controller.signal.aborted) onTileErrorRef.current(basemap.id, true)
    })
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

function RasterBasemapLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  return <TileLayer
    key={basemap.id}
    url={basemap.url}
    attribution={basemap.attribution}
    maxZoom={basemap.maxZoom}
    detectRetina
    zIndex={0}
    eventHandlers={{ tileerror: () => onTileErrorRef.current(basemap.id) }}
  />
}

/** Switching the base layer never recreates the Leaflet MapContainer or its overlays. */
export function BasemapLayer({ basemapId, countryCode, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)
  const googleMapsBasemapId = basemapId === 'google-roadmap' ? 'google-roadmap' : 'google-satellite'
  const googleMapsActive = basemapId === 'google-roadmap' || basemapId === 'google-satellite'

  // Key the Google overlay by its active state as well as its type. Otherwise React
  // keeps the same Google Maps instance mounted while a non-Google basemap is
  // selected, which can leave its DOM layer above the newly selected Leaflet layer.
  const googleMapsLayer = <GoogleMapsJavaScriptBasemap key={`${googleMapsBasemapId}:${googleMapsActive}`} active={googleMapsActive} basemapId={googleMapsBasemapId} mapType={googleMapsBasemapId === 'google-roadmap' ? 'roadmap' : 'satellite'} onError={onTileError} />

  if (basemap.kind === 'vector') {
    // MapLibre layers are imperative Leaflet layers. Their React key must include
    // the selected style, otherwise switching light ↔ dark can leave the previous
    // layer instance attached while the new style is loading.
    return <>{googleMapsLayer}<VectorBasemapLayer basemap={basemap} countryCode={countryCode} onTileError={onTileError} /></>
  }
  if (basemap.id === 'google-satellite') return googleMapsLayer
  if (basemap.id === 'google-satellite-tiles') return <>{googleMapsLayer}<GoogleBasemapLayer basemapId="google-satellite-tiles" onTileError={onTileError} /></>
  if (basemap.kind === 'google') return googleMapsLayer
  if (basemap.id === 'mapbox-satellite') return <>{googleMapsLayer}<MapboxBasemapLayer basemap={basemap} onTileError={onTileError} /></>
  if (basemap.requiresStadiaAuthentication) return <>{googleMapsLayer}<StadiaBasemapLayer basemap={basemap} onTileError={onTileError} /></>

  return <>{googleMapsLayer}<RasterBasemapLayer basemap={basemap} onTileError={onTileError} /></>
}
