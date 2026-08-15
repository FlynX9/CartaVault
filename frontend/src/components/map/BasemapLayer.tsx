import '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

import { getBasemap, type BasemapId, type RasterBasemapDefinition, type VectorBasemapDefinition } from '../../map/basemaps'
import { loadCartaVaultStyle } from '../../map/maplibreStyle'
import { createGoogleSatelliteSession, reportGoogleSatelliteUsage } from '../../api/googleSatellite'
import { getStadiaBasemapConfig } from '../../api/stadiaMaps'
import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'

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
      const dark = basemap.id === 'cartavault-dark'
      const publicUrl = `https://tiles.stadiamaps.com/tiles/${dark ? 'alidade_smooth_dark' : 'alidade_smooth'}/{z}/{x}/{y}{r}.png`
      const stadia = await getStadiaBasemapConfig(controller.signal).catch(() => null)
      const keyQuery = stadia?.tile_url?.match(/\?.*$/)?.[0] ?? ''
      if (!controller.signal.aborted) setStadiaFallbackUrl(`${publicUrl}${keyQuery}`)
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
  const [session, setSession] = useState<{ tile_url: string; attribution: string; max_zoom: number } | null>(null)
  const counts = useRef({ tiles_started: 0, tiles_completed: 0, tiles_failed: 0, tiles_cancelled: 0 })
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    const controller = new AbortController()
    void createGoogleSatelliteSession(controller.signal).then(setSession).catch(() => { if (!controller.signal.aborted) onTileErrorRef.current('google-satellite', true) })
    const flush = window.setInterval(() => {
      const current = counts.current
      if (Object.values(current).some(Boolean)) {
        counts.current = { tiles_started: 0, tiles_completed: 0, tiles_failed: 0, tiles_cancelled: 0 }
        void reportGoogleSatelliteUsage(current).catch(() => undefined)
      }
    }, 5000)
    return () => {
      controller.abort(); window.clearInterval(flush)
      const current = counts.current
      if (Object.values(current).some(Boolean)) void reportGoogleSatelliteUsage(current).catch(() => undefined)
    }
  }, [])
  if (!session) return null
  return <TileLayer key="google-satellite" url={session.tile_url} attribution={session.attribution} maxZoom={session.max_zoom} detectRetina={false} eventHandlers={{ tileloadstart: () => { counts.current.tiles_started += 1 }, tileload: () => { counts.current.tiles_completed += 1 }, tileerror: () => { counts.current.tiles_failed += 1; onTileErrorRef.current('google-satellite') }, tileabort: () => { counts.current.tiles_cancelled += 1 } }} />
}

function StadiaSatelliteLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: (id: BasemapId, fatal?: boolean) => void }) {
  const [url, setUrl] = useState(basemap.url)
  useEffect(() => {
    const controller = new AbortController()
    void getStadiaBasemapConfig(controller.signal).then((config) => {
      if (!controller.signal.aborted && config.tile_url) setUrl(config.tile_url)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [basemap.url])
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
