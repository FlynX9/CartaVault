export const BASEMAP_PREFERENCE_KEY = 'cartavault.basemap'

export const BASEMAP_IDS = [
  'cartavault-light',
  'cartavault-dark',
  'satellite',
  'osm',
] as const

export type BasemapId = (typeof BASEMAP_IDS)[number]

export interface BasemapDefinition {
  id: BasemapId
  label: string
  shortLabel: string
  attribution: string
  url: string
  maxZoom: number
  requiresStadiaAuthentication: boolean
}

export const DEFAULT_BASEMAP_ID: BasemapId = 'cartavault-light'

const stadiaAttribution = '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

const satelliteAttribution = '&copy; CNES, Distribution Airbus DS, &copy; Airbus DS, &copy; PlanetObserver (Contains Copernicus Data) | ' + stadiaAttribution

const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'

function addApiKey(url: string, apiKey: string | undefined): string {
  const normalizedApiKey = apiKey?.trim()
  return normalizedApiKey === undefined || normalizedApiKey === ''
    ? url
    : `${url}?api_key=${encodeURIComponent(normalizedApiKey)}`
}

/** Builds the fixed, reviewed tile sources without ever serializing an absent key. */
export function createBasemaps(apiKey = import.meta.env.VITE_STADIA_MAPS_API_KEY): readonly BasemapDefinition[] {
  return [
    {
      id: 'cartavault-light',
      label: 'CartaVault Light',
      shortLabel: 'Clair',
      url: addApiKey('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', apiKey),
      attribution: stadiaAttribution,
      maxZoom: 20,
      requiresStadiaAuthentication: true,
    },
    {
      id: 'cartavault-dark',
      label: 'CartaVault Dark',
      shortLabel: 'Sombre',
      url: addApiKey('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', apiKey),
      attribution: stadiaAttribution,
      maxZoom: 20,
      requiresStadiaAuthentication: true,
    },
    {
      id: 'satellite',
      label: 'Satellite',
      shortLabel: 'Satellite',
      url: addApiKey('https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg', apiKey),
      attribution: satelliteAttribution,
      maxZoom: 20,
      requiresStadiaAuthentication: true,
    },
    {
      id: 'osm',
      label: 'OpenStreetMap Standard',
      shortLabel: 'OSM',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: osmAttribution,
      maxZoom: 19,
      requiresStadiaAuthentication: false,
    },
  ]
}

export const BASEMAPS = createBasemaps()

export function getBasemap(id: BasemapId): BasemapDefinition {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0]
}

export function parseBasemapId(value: unknown): BasemapId | null {
  return typeof value === 'string' && BASEMAP_IDS.includes(value as BasemapId)
    ? value as BasemapId
    : null
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadBasemapPreference(storage: Storage | null = getStorage()): BasemapId {
  try {
    return parseBasemapId(storage?.getItem(BASEMAP_PREFERENCE_KEY)) ?? DEFAULT_BASEMAP_ID
  } catch {
    return DEFAULT_BASEMAP_ID
  }
}

export function saveBasemapPreference(id: BasemapId, storage: Storage | null = getStorage()): boolean {
  try {
    storage?.setItem(BASEMAP_PREFERENCE_KEY, id)
    return storage !== null
  } catch {
    return false
  }
}
