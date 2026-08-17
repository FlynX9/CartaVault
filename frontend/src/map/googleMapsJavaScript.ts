import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let loaderPromise: Promise<google.maps.MapsLibrary> | null = null
let configuredKey: string | null = null
let created = 0
let destroyed = 0
const authenticationFailureListeners = new Set<() => void>()
let authenticationFailureHandlerInstalled = false

declare global {
  interface Window { gm_authFailure?: () => void }
}

function installAuthenticationFailureHandler(): void {
  if (authenticationFailureHandlerInstalled || typeof window === 'undefined') return
  authenticationFailureHandlerInstalled = true
  const previous = window.gm_authFailure
  window.gm_authFailure = () => {
    previous?.()
    authenticationFailureListeners.forEach((listener) => listener())
  }
}

export function onGoogleMapsAuthenticationFailure(listener: () => void): () => void {
  authenticationFailureListeners.add(listener)
  return () => authenticationFailureListeners.delete(listener)
}

export function loadGoogleMapsJavaScript(apiKey: string, language: 'fr' | 'en', region = ''): Promise<google.maps.MapsLibrary> {
  if (loaderPromise !== null) {
    if (configuredKey !== apiKey) return Promise.reject(new Error('La clé Google Maps JavaScript a changé. Rechargez la page pour l’utiliser.'))
    return loaderPromise
  }
  configuredKey = apiKey
  installAuthenticationFailureHandler()
  setOptions({ key: apiKey, v: 'weekly', language, ...(region ? { region } : {}), authReferrerPolicy: 'origin' })
  loaderPromise = importLibrary('maps')
  return loaderPromise
}

export function recordGoogleMapInstanceCreated(): void {
  created += 1
  if (import.meta.env.DEV) console.debug('google_map_instance_created', { created, active: created - destroyed })
}

export function recordGoogleMapInstanceDestroyed(): void {
  destroyed += 1
  if (import.meta.env.DEV) console.debug('google_map_instance_destroyed', { destroyed, active: created - destroyed })
}

export function getGoogleMapInstanceMetrics() {
  return { created, destroyed, active: created - destroyed }
}
