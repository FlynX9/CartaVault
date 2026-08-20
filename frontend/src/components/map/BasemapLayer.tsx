import '@maplibre/maplibre-gl-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'

import { getBasemap, type BasemapId, type RasterBasemapDefinition, type VectorBasemapDefinition } from '../../map/basemaps'
import { loadCartaVaultStyle, localizeCountryNames, type MapLabelLanguage } from '../../map/maplibreStyle'
import { ApiError } from '../../api/client'
import { createArcGISBasemapSession } from '../../api/arcgisMaps'
import { getCartaVaultVectorConfig, type CartaVaultVectorConfig } from '../../api/vectorBasemap'
import { cartaVaultTileTemplate, configureCartaVaultProtocol } from '../../map/vectorBasemapProtocol'
import { getOfflineBasemapVersion } from '../../pwa/offlineData'
import { GoogleMapsJavaScriptBasemap } from './GoogleMapsJavaScriptBasemap'
import { useI18n } from '../../i18n/useI18n'

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

function VectorBasemapLayer({ basemap, countryCode, language, onTileError }: { basemap: VectorBasemapDefinition; countryCode?: string | null; language: MapLabelLanguage; onTileError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void }) {
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
      const purpose = 'offline'
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
      const offlineVersion = await getOfflineBasemapVersion()
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
        const style = await loadCartaVaultStyle(selected.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || selected.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom }, language)
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
  }, [countryCode, language, map])

  useEffect(() => {
    const layer = layerRef.current
    const config = configRef.current
    if (layer === null || config === null || appliedStyleRef.current === basemap.id) return
    const controller = new AbortController()
    void loadCartaVaultStyle(basemap.styleUrl, cartaVaultTileTemplate(config), config.glyphs_url || basemap.glyphsUrl, controller.signal, { min: config.min_zoom, max: config.max_zoom }, language)
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
  }, [basemap, countryCode, language])

  return null
}

function OpenFreeMapBasemapLayer({ basemap, language, onTileError }: { basemap: VectorBasemapDefinition; language: MapLabelLanguage; onTileError: BasemapLayerProps['onTileError'] }) {
  const map = useMap()
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    const layer = L.maplibreGL({ style: basemap.styleUrl, interactive: false, attributionControl: false })
    const handleError = (event: unknown) => onTileErrorRef.current(basemap.id, false, (event as { error?: Error }).error?.message ?? 'OpenFreeMap est indisponible.', 'OPENFREEMAP_UNAVAILABLE')
    // leaflet-maplibre-gl creates its MapLibre instance from onAdd(). Reading
    // it before addTo() returns undefined and crashes the complete React tree.
    layer.addTo(map)
    const renderer = layer.getMaplibreMap()
    const applyLanguage = () => {
      const style = renderer.getStyle()
      localizeCountryNames(style, language)
      for (const styleLayer of style.layers) {
        if (styleLayer.type !== 'symbol') continue
        const textField = styleLayer.layout?.['text-field']
        if (textField !== undefined) renderer.setLayoutProperty(styleLayer.id, 'text-field', textField)
      }
    }
    if (renderer.isStyleLoaded()) applyLanguage()
    else renderer.once('style.load', applyLanguage)
    renderer.on('error', handleError)
    map.attributionControl?.addAttribution(basemap.attribution)
    return () => {
      renderer.off('error', handleError)
      renderer.off('style.load', applyLanguage)
      if (map.hasLayer(layer)) layer.removeFrom(map)
      map.attributionControl?.removeAttribution(basemap.attribution)
    }
  }, [basemap, language, map])
  return null
}

function ArcGISBasemapLayer({ basemap, onTileError }: { basemap: RasterBasemapDefinition; onTileError: BasemapLayerProps['onTileError'] }) {
  const [session, setSession] = useState<Awaited<ReturnType<typeof createArcGISBasemapSession>> | null>(null)
  const [generation, setGeneration] = useState(0)
  const onTileErrorRef = useRef(onTileError)
  onTileErrorRef.current = onTileError
  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout> | null = null
    setSession(null)
    void createArcGISBasemapSession().then((value) => {
      if (!current) return
      setSession(value)
      timer = setTimeout(() => setGeneration((item) => item + 1), Math.max(30_000, Date.parse(value.expires) - Date.now() - 60_000))
    }).catch((error: unknown) => {
      if (current) onTileErrorRef.current(basemap.id, true, error instanceof Error ? error.message : undefined, error instanceof ApiError ? error.code ?? undefined : undefined)
    })
    return () => { current = false; if (timer !== null) clearTimeout(timer) }
  }, [basemap.id, generation])
  if (!session) return null
  return <TileLayer key={`${basemap.id}:${session.expires}`} url={session.tile_url} attribution={session.attribution} maxZoom={session.max_zoom} detectRetina={false} eventHandlers={{ tileerror: () => onTileErrorRef.current(basemap.id) }} />
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
  const { locale } = useI18n()
  const language: MapLabelLanguage = locale.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  const basemap = getBasemap(basemapId)
  const googleMapsBasemapId = 'google-satellite'
  const googleMapsActive = basemapId === 'google-satellite'

  // Key the Google overlay by its active state as well as its type. Otherwise React
  // keeps the same Google Maps instance mounted while a non-Google basemap is
  // selected, which can leave its DOM layer above the newly selected Leaflet layer.
  const googleMapsLayer = <GoogleMapsJavaScriptBasemap key={`${googleMapsBasemapId}:${googleMapsActive}`} active={googleMapsActive} basemapId={googleMapsBasemapId} mapType="satellite" onError={onTileError} />

  if (basemap.kind === 'vector') {
    // MapLibre layers are imperative Leaflet layers. Their React key must include
    // the selected style, otherwise switching light ↔ dark can leave the previous
    // layer instance attached while the new style is loading.
    return <>{googleMapsLayer}{basemap.source === 'remote-style' ? <OpenFreeMapBasemapLayer basemap={basemap} language={language} onTileError={onTileError} /> : <VectorBasemapLayer basemap={basemap} countryCode={countryCode} language={language} onTileError={onTileError} />}</>
  }
  if (basemap.id === 'google-satellite') return googleMapsLayer
  if (basemap.kind === 'google') return googleMapsLayer
  if (basemap.id === 'arcgis-satellite') return <>{googleMapsLayer}<ArcGISBasemapLayer basemap={basemap} onTileError={onTileError} /></>

  return <>{googleMapsLayer}<RasterBasemapLayer basemap={basemap} onTileError={onTileError} /></>
}
