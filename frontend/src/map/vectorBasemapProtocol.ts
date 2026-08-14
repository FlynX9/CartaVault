import maplibregl, { type RequestParameters } from 'maplibre-gl'
import { PMTiles } from 'pmtiles'

import type { CartaVaultVectorConfig } from '../api/vectorBasemap'
import { getOfflineBasemapTile } from '../pwa/offlineData'

let registered = false
let activeConfig: CartaVaultVectorConfig | null = null
let archive: PMTiles | null = null

function parseTile(url: string): { version: string; z: number; x: number; y: number } {
  const match = /^cartavault:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/.exec(url)
  if (!match) throw new Error('Invalid CartaVault tile URL')
  return { version: decodeURIComponent(match[1]), z: Number(match[2]), x: Number(match[3]), y: Number(match[4]) }
}

async function tile(params: RequestParameters, controller: AbortController) {
  const coordinates = parseTile(params.url)
  const cached = await getOfflineBasemapTile(coordinates.version, coordinates.z, coordinates.x, coordinates.y)
  if (navigator.onLine === false && cached) return { data: new Uint8Array(await cached.arrayBuffer()) }
  if (!activeConfig?.archive_url || activeConfig.version !== coordinates.version) {
    if (cached) return { data: new Uint8Array(await cached.arrayBuffer()) }
    throw new Error('CartaVault vector archive unavailable')
  }
  try {
    archive ??= new PMTiles(activeConfig.archive_url)
    const response = await archive.getZxy(coordinates.z, coordinates.x, coordinates.y, controller.signal)
    return { data: response ? new Uint8Array(response.data) : new Uint8Array() }
  } catch (error) {
    if (cached) return { data: new Uint8Array(await cached.arrayBuffer()) }
    throw error
  }
}

export function configureCartaVaultProtocol(config: CartaVaultVectorConfig): void {
  if (activeConfig?.archive_url !== config.archive_url || activeConfig.version !== config.version) archive = null
  activeConfig = config
  if (registered) return
  maplibregl.addProtocol('cartavault', (params: RequestParameters, abortController: AbortController) => tile(params, abortController))
  registered = true
}

export function cartaVaultTileTemplate(config: CartaVaultVectorConfig): string {
  return `cartavault://${encodeURIComponent(config.version)}/{z}/{x}/{y}`
}
