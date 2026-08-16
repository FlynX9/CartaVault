import '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

import { getBasemap, type BasemapId, type RasterBasemapDefinition, type VectorBasemapDefinition } from '../../map/basemaps'
import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { createGoogleSatelliteSession } from '../../api/googleSatellite'
import { getStadiaBasemapConfig } from '../../api/stadiaMaps'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'
import { API_BASE_URL } from '../../config'

interface BasemapLayerProps {
  basemapId: BasemapId
  countryCode?: string | null
  onTileError: (id: BasemapId, fatal?: boolean) => void
}

function VectorBasemapLayer({ basemap, countryCode, onTileError }: { basemap: VectorBasemapDefinition; countryCode?: string | null; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const map = useMap()
  const [stadiaFallbackUrl, setStadiaFallbackUrl] = useState<string | null>(null)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError

  useEffect(() => {
    const controller = new AbortController()
    let layer: L.MaplibreGLLayer | null = null
    let mapLibreErrorHandler: (() => void) | null = null

    void (async () => {
      const configured = await getCartaVaultVectorConfig(controller.signal, true, countryCode ?? undefined, 'online')
      const offlineVersion = navigator.onLine === false ? await getOfflineBasemapVersion() : null
      const config = offlineVersion ? { ...configured, version: offlineVersion, available: true } : configured
      if (config.available && config.archive_url) {
        configureCartaVaultProtocol(config)
        return loadCartaVaultStyle(basemap.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || basemap.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom })
      }
      const style = basemap.id === 'cartavault-dark' ? 'alidade_smooth_dark' : 'alidade_smooth'
      const stadia = await getStadiaBasemapConfig(controller.signal).catch(() => null)
      const tilePath = stadia?.tile_path
        .replace('{style}', style)
        .replace('{extension}', 'png') ?? null
      if (!controller.signal.aborted) setStadiaFallbackUrl(tilePath ? `${API_BASE_URL}${tilePath}` : null)
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

  if (stadiaFallbackUrl) {
    return <TileLayer
      key={`stadia-${basemap.id}`}
      url={stadiaFallbackUrl}
      attribution={basemap.attribution}
      maxZoom={20}
      detectRetina
      eventHandlers={{ tileerror: () => onTileErrorRef.current(basemap.id) }}
    />
  }
  return null
}

function GoogleSatelliteLayer({ onTileError }: { onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const [session, setSession] = useState<{ tile_path: string; attribution: string; max_zoom: number } | null>(null)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    const controller = new AbortController()
    void createGoogleSatelliteSession(controller.signal).then(setSession).catch(() => { if (!controller.signal.aborted) onTileErrorRef.current('google-satellite', true) })
    return () => controller.abort()
  }, [])
  if (!session) return null
  return <TileLayer key="google-satellite" url={`${API_BASE_URL}${session.tile_path}`} attribution={session.attribution} maxZoom={session.max_zoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileErrorRef.current('google-satellite') }} />
}

function StadiaSatelliteLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void getStadiaBasemapConfig(controller.signal).then((config) => {
      const tilePath = config.tile_path
        .replace('{style}', 'alidade_satellite')
        .replace('{extension}', 'jpg')
      if (!controller.signal.aborted) setUrl(`${API_BASE_URL}${tilePath}`)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [basemap.url])
  if (!url) return null
  return <TileLayer key={`${basemap.id}:${url}`} url={url} attribution={basemap.attribution} maxZoom={basemap.maxZoom} detectRetina eventHandlers={{ tileerror: () => onTileError(basemap.id) }} />
}

/** Switching the base layer never recreates the Leaflet MapContainer or its overlays. */
export function BasemapLayer({ basemapId, countryCode, onTileError }: BasemapLayerProps) {
  const basemap = getBasemap(basemapId)

  if (basemap.kind === 'vector') {
    return <VectorBasemapLayer key={`${basemap.id}:${countryCode ?? ''}`} basemap={basemap} countryCode={countryCode} onTileError={onTileError} />
  }
  if (basemap.kind === 'google') return <GoogleSatelliteLayer onTileError={onTileError} />
  if (basemap.id === 'satellite' && basemap.requiresStadiaAuthentication) return <StadiaSatelliteLayer basemap={basemap} onTileError={onTileError} />

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
