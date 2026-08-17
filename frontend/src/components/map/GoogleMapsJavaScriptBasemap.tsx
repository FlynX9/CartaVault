import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

import { ApiError } from '../../api/client'
import { getGoogleMapsJavaScriptConfig, markGoogleMapsJavaScriptLoaded, type GoogleMapsJavaScriptMapType } from '../../api/googleSatellite'
import type { BasemapId } from '../../map/basemaps'
import { loadGoogleMapsJavaScript, onGoogleMapsAuthenticationFailure, recordGoogleMapInstanceCreated, recordGoogleMapInstanceDestroyed } from '../../map/googleMapsJavaScript'

interface Props {
  active: boolean
  basemapId: 'google-roadmap' | 'google-satellite'
  mapType: GoogleMapsJavaScriptMapType
  onError: (id: BasemapId, fatal?: boolean, reason?: string, errorCode?: string) => void
}

export function GoogleMapsJavaScriptBasemap({ active, basemapId, mapType, onError }: Props) {
  const leafletMap = useMap()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const initializationRef = useRef<Promise<void> | null>(null)
  const authenticationFailureCleanupRef = useRef<(() => void) | null>(null)
  const lifecycleGenerationRef = useRef(0)
  const activeRef = useRef(active)
  const onErrorRef = useRef(onError)
  activeRef.current = active
  onErrorRef.current = onError

  useEffect(() => {
    lifecycleGenerationRef.current += 1
    const syncCamera = () => {
      const googleMap = googleMapRef.current
      if (!googleMap) return
      const center = leafletMap.getCenter()
      googleMap.moveCamera({ center: { lat: center.lat, lng: center.lng }, zoom: leafletMap.getZoom() })
    }
    leafletMap.on('move zoom resize', syncCamera)
    return () => {
      lifecycleGenerationRef.current += 1
      leafletMap.off('move zoom resize', syncCamera)
      if (googleMapRef.current) recordGoogleMapInstanceDestroyed()
      googleMapRef.current = null
      initializationRef.current = null
      authenticationFailureCleanupRef.current?.()
      authenticationFailureCleanupRef.current = null
      hostRef.current?.remove()
      hostRef.current = null
      leafletMap.getContainer().classList.remove('has-google-maps-js-basemap')
    }
  }, [leafletMap])

  useEffect(() => {
    const leafletContainer = leafletMap.getContainer()
    if (!active) {
      if (hostRef.current) hostRef.current.hidden = true
      leafletContainer.classList.remove('has-google-maps-js-basemap')
      return
    }

    leafletContainer.classList.add('has-google-maps-js-basemap')
    if (hostRef.current) hostRef.current.hidden = false
    if (googleMapRef.current || initializationRef.current) return

    const host = document.createElement('div')
    host.className = 'google-maps-js-basemap'
    host.setAttribute('aria-hidden', 'true')
    leafletContainer.prepend(host)
    hostRef.current = host
    const lifecycleGeneration = lifecycleGenerationRef.current

    let failed = false
    const fail = (reason: string, errorCode: string) => {
      if (failed || lifecycleGeneration !== lifecycleGenerationRef.current) return
      failed = true
      if (googleMapRef.current) recordGoogleMapInstanceDestroyed()
      googleMapRef.current = null
      initializationRef.current = null
      authenticationFailureCleanupRef.current?.()
      authenticationFailureCleanupRef.current = null
      host.remove()
      if (hostRef.current === host) hostRef.current = null
      leafletContainer.classList.remove('has-google-maps-js-basemap')
      onErrorRef.current(basemapId, true, reason, errorCode)
    }
    const mapLabel = mapType === 'roadmap' ? 'Google classique' : 'Google Satellite'
    authenticationFailureCleanupRef.current = onGoogleMapsAuthenticationFailure(() => fail(`${mapLabel} n’est pas disponible avec la configuration actuelle de votre clé Google. Vérifiez Maps JavaScript API, la facturation et les restrictions de référent HTTP.`, 'GOOGLE_MAPS_JS_AUTHENTICATION_FAILED'))

    initializationRef.current = getGoogleMapsJavaScriptConfig(mapType)
      .then(async (config) => {
        const { Map } = await loadGoogleMapsJavaScript(config.api_key, config.language, config.region)
        if (lifecycleGeneration !== lifecycleGenerationRef.current) return
        const center = leafletMap.getCenter()
        const googleMap = new Map(host, {
          center: { lat: center.lat, lng: center.lng },
          zoom: leafletMap.getZoom(),
          mapTypeId: config.map_type,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'none',
          keyboardShortcuts: false,
          backgroundColor: '#dfe7df',
        })
        googleMapRef.current = googleMap
        recordGoogleMapInstanceCreated()
        google.maps.event.addListenerOnce(googleMap, 'tilesloaded', () => { void markGoogleMapsJavaScriptLoaded(mapType).catch(() => undefined) })
        if (!activeRef.current) host.hidden = true
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : `${mapLabel} n’est pas disponible avec la configuration actuelle de votre clé Google.`
        fail(reason, error instanceof ApiError ? error.code ?? 'GOOGLE_MAPS_JS_LOAD_FAILED' : 'GOOGLE_MAPS_JS_LOAD_FAILED')
      })
  }, [active, basemapId, leafletMap, mapType])

  return null
}
