import { getCategories } from '../api/categories'
import { getPhotoFileUrl, getPlacePhotos } from '../api/photos'
import { getPlaces, getPlaceDetails } from '../api/places'
import { getStatuses } from '../api/statuses'
import { getTags } from '../api/tags'
import { getTrip } from '../api/trips'
import { getPlaceAnnotations } from '../api/annotations'
import { getCartaVaultVectorConfig, type CartaVaultVectorConfig } from '../api/vectorBasemap'
import type { CategoryRead, TagRead } from '../types/admin'
import type { PoiMap } from '../types/map'
import type { Photo } from '../types/photo'
import type { PlaceDetails } from '../types/place'
import type { PlaceStatus } from '../types/status'
import type { Trip } from '../types/trip'
import type { PlaceAnnotation } from '../types/annotation'

const DB_NAME = 'cartavault-offline'
const DB_VERSION = 2
const PACKAGE_STORE = 'packages'
const IDENTITY_STORE = 'identities'
const TILE_STORE = 'vector-tiles'
const ACTIVE_USER_KEY = 'cartavault:offline-active-user'
const SCHEMA_VERSION = 1

export type OfflinePackageKind = 'map' | 'trip'
export interface OfflinePackageOptions {
  places: boolean
  organization: boolean
  trip: boolean
  annotations: boolean
  routeGeometry: boolean
  thumbnails: boolean
}
export interface OfflineSnapshot {
  map: PoiMap
  places: PlaceDetails[]
  categories: CategoryRead[]
  tags: TagRead[]
  statuses: PlaceStatus[]
  trip: Trip | null
  photos: Record<string, Photo[]>
  thumbnails: Record<string, Blob>
  annotations: Record<string, PlaceAnnotation[]>
}
export interface OfflineBasemapMetadata { version: string; bbox: [number, number, number, number]; minZoom: number; maxZoom: number; tileKeys: string[]; tileBytes: number }
export interface OfflineDownloadProgress { phase: 'data' | 'basemap' | 'saving'; completed: number; total: number; bytes: number }
export interface OfflinePackage {
  id: string
  kind: OfflinePackageKind
  sourceId: string
  mapId: string
  userId: string
  title: string
  schemaVersion: number
  revision: string
  included: OfflinePackageOptions
  createdAt: string
  updatedAt: string
  lastSyncedAt: string
  estimatedBytes: number
  actualBytes: number
  snapshot: OfflineSnapshot
  status?: 'ready'
  basemap?: OfflineBasemapMetadata
}
export interface OfflineIdentity { id: string; email: string; display_name: string; is_admin: boolean }
interface OfflineVectorTile { id: string; version: string; z: number; x: number; y: number; data: Blob; size: number }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Le stockage hors ligne n’est pas disponible dans ce navigateur.')); return }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PACKAGE_STORE)) {
        const packages = db.createObjectStore(PACKAGE_STORE, { keyPath: 'id' })
        packages.createIndex('by-user', 'userId', { unique: false })
        packages.createIndex('by-source', ['userId', 'kind', 'sourceId'], { unique: true })
      }
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(TILE_STORE)) {
        const tiles = db.createObjectStore(TILE_STORE, { keyPath: 'id' })
        tiles.createIndex('by-version', 'version', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Impossible d’ouvrir le stockage hors ligne.'))
  })
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(storeName, mode).objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Opération hors ligne impossible.'))
    })
  } finally { db.close() }
}

function now() { return new Date().toISOString() }
function packageId(userId: string, kind: OfflinePackageKind, sourceId: string) { return `${userId}:${kind}:${sourceId}` }
function sizeOf(value: unknown) { return new Blob([JSON.stringify(value)]).size }
function isNetworkFailure(error: unknown) { return error instanceof TypeError || (error instanceof Error && /network|fetch|offline|failed to fetch/i.test(error.message)) }

export function setOfflineIdentity(identity: OfflineIdentity | null): void {
  if (identity === null) { window.localStorage.removeItem(ACTIVE_USER_KEY); return }
  window.localStorage.setItem(ACTIVE_USER_KEY, identity.id)
  void transaction(IDENTITY_STORE, 'readwrite', (store) => store.put(identity)).catch(() => undefined)
}
export async function getOfflineIdentity(): Promise<OfflineIdentity | null> {
  const id = window.localStorage.getItem(ACTIVE_USER_KEY)
  return id ? (await transaction<OfflineIdentity | undefined>(IDENTITY_STORE, 'readonly', (store) => store.get(id))) ?? null : null
}
export async function listOfflinePackages(userId: string): Promise<OfflinePackage[]> {
  const items = await transaction<OfflinePackage[]>(PACKAGE_STORE, 'readonly', (store) => store.index('by-user').getAll(userId))
  return items.filter((item) => item.schemaVersion === SCHEMA_VERSION && (item.status ?? 'ready') === 'ready').sort((left, right) => right.lastSyncedAt.localeCompare(left.lastSyncedAt))
}
export async function getOfflinePackage(userId: string, kind: OfflinePackageKind, sourceId: string): Promise<OfflinePackage | null> {
  const result = await transaction<OfflinePackage | undefined>(PACKAGE_STORE, 'readonly', (store) => store.index('by-source').get([userId, kind, sourceId]))
  return result?.schemaVersion === SCHEMA_VERSION ? result : null
}
export async function deleteOfflinePackage(id: string): Promise<void> {
  const db = await database()
  try {
    const packages = await new Promise<OfflinePackage[]>((resolve, reject) => {
      const request = db.transaction(PACKAGE_STORE).objectStore(PACKAGE_STORE).getAll()
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    const removed = packages.find((item) => item.id === id)
    const retainedKeys = new Set(packages.filter((item) => item.id !== id).flatMap((item) => item.basemap?.tileKeys ?? []))
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PACKAGE_STORE, TILE_STORE], 'readwrite')
      tx.objectStore(PACKAGE_STORE).delete(id)
      for (const key of removed?.basemap?.tileKeys ?? []) if (!retainedKeys.has(key)) tx.objectStore(TILE_STORE).delete(key)
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
export async function getOfflineBasemapTile(version: string, z: number, x: number, y: number): Promise<Blob | null> {
  const tile = await transaction<OfflineVectorTile | undefined>(TILE_STORE, 'readonly', (store) => store.get(`${version}/${z}/${x}/${y}`))
  return tile?.data ?? null
}
export async function hasOfflineBasemap(version: string): Promise<boolean> {
  const identity = await getOfflineIdentity()
  if (!identity) return false
  return (await listOfflinePackages(identity.id)).some((item) => item.basemap?.version === version && (item.basemap.tileKeys.length > 0))
}
export async function getOfflineBasemapVersion(): Promise<string | null> {
  const identity = await getOfflineIdentity()
  if (!identity) return null
  return (await listOfflinePackages(identity.id)).find((item) => (item.basemap?.tileKeys.length ?? 0) > 0)?.basemap?.version ?? null
}
export async function clearOfflineDataForUser(userId: string): Promise<void> {
  const packages = await listOfflinePackages(userId)
  for (const item of packages) await deleteOfflinePackage(item.id)
  await transaction(IDENTITY_STORE, 'readwrite', (store) => store.delete(userId))
  if (window.localStorage.getItem(ACTIVE_USER_KEY) === userId) window.localStorage.removeItem(ACTIVE_USER_KEY)
}
export async function reconcileOfflinePackages(visibleMapIds: readonly string[]): Promise<void> {
  const identity = await getOfflineIdentity()
  if (!identity) return
  const packages = await listOfflinePackages(identity.id)
  for (const item of packages.filter((candidate) => !visibleMapIds.includes(candidate.mapId))) await deleteOfflinePackage(item.id)
}
export async function getOfflineStorageEstimate() {
  const estimate = await navigator.storage?.estimate?.()
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null }
}
export async function requestPersistentOfflineStorage() { return navigator.storage?.persist ? navigator.storage.persist() : false }

async function allPlaceDetails(mapId: string, signal?: AbortSignal): Promise<PlaceDetails[]> {
  const places: PlaceDetails[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const page = await getPlaces({ mapId, limit: pageSize, offset }, signal)
    places.push(...page)
    if (page.length < pageSize) return places
  }
}
async function photosFor(places: PlaceDetails[], signal?: AbortSignal): Promise<Record<string, Photo[]>> {
  const results = await Promise.all(places.map(async (place) => {
    try { return [place.id, await getPlacePhotos(place.id, signal ?? new AbortController().signal)] as const } catch { return [place.id, []] as const }
  }))
  return Object.fromEntries(results)
}
async function createThumbnail(photo: Photo, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const response = await fetch(getPhotoFileUrl(photo.id), { credentials: 'include', signal })
    if (!response.ok) return null
    const source = await response.blob()
    if (!source.type.startsWith('image/')) return null
    if (!('createImageBitmap' in window)) return source.size <= 2 * 1024 * 1024 ? source : null
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale)); const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) return null
    context.drawImage(bitmap, 0, 0, width, height); bitmap.close()
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.78))
  } catch { return null }
}
async function thumbnailsFor(photos: Record<string, Photo[]>, signal?: AbortSignal): Promise<Record<string, Blob>> {
  const selected = Object.values(photos).flat().filter((photo) => photo.is_primary)
  const output: Record<string, Blob> = {}
  for (let index = 0; index < selected.length; index += 3) {
    const batch = await Promise.all(selected.slice(index, index + 3).map(async (photo) => [photo.id, await createThumbnail(photo, signal)] as const))
    for (const [id, blob] of batch) if (blob) output[id] = blob
  }
  return output
}
async function buildSnapshot(map: PoiMap, trip: Trip | null, options: OfflinePackageOptions, signal?: AbortSignal): Promise<OfflineSnapshot> {
  const placeIds = trip === null ? null : new Set([
    ...trip.days.flatMap((day) => day.stops.map((stop) => stop.place_id).filter((id): id is string => id !== null)),
    ...trip.nights.map((night) => night.place_id).filter((id): id is string => id !== null),
    trip.departure?.place_id ?? null,
    trip.arrival?.place_id ?? null,
  ].filter((id): id is string => id !== null))
  const mapPlaces = options.places ? await allPlaceDetails(map.id, signal) : []
  const places = placeIds === null ? mapPlaces : await Promise.all([...placeIds].map((id) => getPlaceDetails(id, signal ?? new AbortController().signal))).then((items) => items.filter((item) => item.map_id === map.id))
  const [categories, tags, statuses] = options.organization ? await Promise.all([getCategories(signal, undefined, map.id), getTags(signal, undefined, map.id), getStatuses(map.id, signal)]) : [[], [], []]
  const photos = options.thumbnails ? await photosFor(places, signal) : {}
  const annotationEntries = options.annotations ? await Promise.all(places.map(async (place) => {
    try { return [place.id, await getPlaceAnnotations(place.id, signal)] as const } catch { return [place.id, []] as const }
  })) : []
  const storedTrip = options.trip && trip ? {
    ...trip,
    days: trip.days.map((day) => ({ ...day, route_geometry: options.routeGeometry ? day.route_geometry : null, route_segments: options.routeGeometry ? day.route_segments : null })),
  } : null
  return { map, places, categories, tags, statuses, trip: storedTrip, photos, thumbnails: options.thumbnails ? await thumbnailsFor(photos, signal) : {}, annotations: Object.fromEntries(annotationEntries) }
}
function paddedBounds(snapshot: OfflineSnapshot, config: CartaVaultVectorConfig): [number, number, number, number] | null {
  const coordinates: Array<[number, number]> = snapshot.trip ? [
    ...snapshot.trip.days.flatMap((day) => [...day.stops.map((stop) => [stop.longitude, stop.latitude] as [number, number]), ...(day.route_geometry?.coordinates ?? [])]),
    ...snapshot.trip.nights.map((night) => [night.longitude, night.latitude] as [number, number]),
    ...(snapshot.trip.departure ? [[snapshot.trip.departure.longitude, snapshot.trip.departure.latitude] as [number, number]] : []),
    ...(snapshot.trip.arrival ? [[snapshot.trip.arrival.longitude, snapshot.trip.arrival.latitude] as [number, number]] : []),
  ] : snapshot.places.filter((place) => place.longitude !== null && place.latitude !== null).map((place) => [place.longitude as number, place.latitude as number])
  if (!coordinates.length) return null
  const lons = coordinates.map(([lon]) => lon); const lats = coordinates.map(([, lat]) => lat)
  const middleLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const latPad = config.offline_padding_km / 110.574
  const lonPad = config.offline_padding_km / Math.max(20, 111.320 * Math.cos(middleLat * Math.PI / 180))
  return [Math.max(-180, Math.min(...lons) - lonPad), Math.max(-85.0511, Math.min(...lats) - latPad), Math.min(180, Math.max(...lons) + lonPad), Math.min(85.0511, Math.max(...lats) + latPad)]
}
function lonToX(lon: number, z: number) { return Math.floor((lon + 180) / 360 * 2 ** z) }
function latToY(lat: number, z: number) { const rad = lat * Math.PI / 180; return Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * 2 ** z) }
function tilesForBounds(bbox: [number, number, number, number], minZoom: number, maxZoom: number) {
  const output: Array<{ z: number; x: number; y: number }> = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const max = 2 ** z - 1
    const minX = Math.max(0, lonToX(bbox[0], z)); const maxX = Math.min(max, lonToX(bbox[2], z))
    const minY = Math.max(0, latToY(bbox[3], z)); const maxY = Math.min(max, latToY(bbox[1], z))
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) output.push({ z, x, y })
  }
  return output
}
async function prepareBasemap(snapshot: OfflineSnapshot, signal?: AbortSignal, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<{ metadata?: OfflineBasemapMetadata; tiles: OfflineVectorTile[] }> {
  let config: CartaVaultVectorConfig
  try { config = await getCartaVaultVectorConfig(signal) } catch { return { tiles: [] } }
  if (!config.available || !config.archive_url) return { tiles: [] }
  const bbox = paddedBounds(snapshot, config)
  if (!bbox) return { tiles: [] }
  const coordinates = tilesForBounds(bbox, config.offline_min_zoom, config.offline_max_zoom)
  if (coordinates.length > config.offline_max_tiles) throw new Error(`La zone hors ligne contient ${coordinates.length.toLocaleString('fr-FR')} tuiles (maximum ${config.offline_max_tiles.toLocaleString('fr-FR')}). Réduisez la sortie ou le niveau de détail.`)
  const storage = await getOfflineStorageEstimate()
  const estimatedBytes = coordinates.length * 18 * 1024
  if (storage.quota !== null && storage.usage !== null && estimatedBytes > storage.quota - storage.usage) throw new Error('Espace de stockage insuffisant pour le fond CartaVault de cette zone.')
  if ('caches' in window) {
    const fontstacks = ['Noto Sans Regular', 'Noto Sans Italic']
    await Promise.all(fontstacks.flatMap((font) => ['0-255', '256-511'].map(async (range) => {
      const url = config.glyphs_url.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range)
      try { await fetch(url, { credentials: 'include', signal }) } catch { /* Geometry remains usable without an optional glyph range. */ }
    })))
  }
  const { PMTiles } = await import('pmtiles')
  const archive = new PMTiles(config.archive_url)
  const tiles: OfflineVectorTile[] = []
  let bytes = 0; let completed = 0
  for (let offset = 0; offset < coordinates.length; offset += 6) {
    signal?.throwIfAborted()
    const batch = await Promise.all(coordinates.slice(offset, offset + 6).map(async ({ z, x, y }) => {
      const id = `${config.version}/${z}/${x}/${y}`
      const existing = await transaction<OfflineVectorTile | undefined>(TILE_STORE, 'readonly', (store) => store.get(id))
      if (existing) return existing
      const result = await archive.getZxy(z, x, y, signal)
      if (!result) return null
      const data = new Blob([result.data], { type: 'application/vnd.mapbox-vector-tile' })
      return { id, version: config.version, z, x, y, data, size: data.size }
    }))
    for (const tile of batch) if (tile) { tiles.push(tile); bytes += tile.size }
    completed += batch.length
    onProgress?.({ phase: 'basemap', completed, total: coordinates.length, bytes })
  }
  return { metadata: { version: config.version, bbox, minZoom: config.offline_min_zoom, maxZoom: config.offline_max_zoom, tileKeys: tiles.map((tile) => tile.id), tileBytes: bytes }, tiles }
}

async function savePackage(userId: string, kind: OfflinePackageKind, sourceId: string, map: PoiMap, title: string, trip: Trip | null, options: OfflinePackageOptions, signal?: AbortSignal, onProgress?: (progress: OfflineDownloadProgress) => void): Promise<OfflinePackage> {
  onProgress?.({ phase: 'data', completed: 0, total: 1, bytes: 0 })
  const snapshot = await buildSnapshot(map, trip, options, signal)
  const prepared = await prepareBasemap(snapshot, signal, onProgress)
  const current = await getOfflinePackage(userId, kind, sourceId)
  const timestamp = now()
  const byteSize = sizeOf(snapshot) + Object.values(snapshot.thumbnails).reduce((total, thumbnail) => total + thumbnail.size, 0)
  const actualBytes = byteSize + (prepared.metadata?.tileBytes ?? 0)
  const value: OfflinePackage = { id: packageId(userId, kind, sourceId), kind, sourceId, mapId: map.id, userId, title, schemaVersion: SCHEMA_VERSION, revision: `${map.updated_at}:${trip?.updated_at ?? ''}`, included: options, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, lastSyncedAt: timestamp, estimatedBytes: actualBytes, actualBytes, snapshot, status: 'ready', basemap: prepared.metadata }
  onProgress?.({ phase: 'saving', completed: 0, total: 1, bytes: actualBytes })
  const db = await database()
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PACKAGE_STORE, TILE_STORE], 'readwrite')
    for (const tile of prepared.tiles) tx.objectStore(TILE_STORE).put(tile)
    tx.objectStore(PACKAGE_STORE).put(value)
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  }) } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('Espace de stockage insuffisant pour les données hors ligne.')
    throw error
  } finally { db.close() }
  for (const key of current?.basemap?.tileKeys ?? []) {
    if (!(prepared.metadata?.tileKeys.includes(key))) {
      const stillUsed = (await transaction<OfflinePackage[]>(PACKAGE_STORE, 'readonly', (store) => store.getAll())).some((item) => item.basemap?.tileKeys.includes(key))
      if (!stillUsed) await transaction(TILE_STORE, 'readwrite', (store) => store.delete(key))
    }
  }
  onProgress?.({ phase: 'saving', completed: 1, total: 1, bytes: actualBytes })
  return value
}
export async function downloadMapOfflinePackage(userId: string, map: PoiMap, options: OfflinePackageOptions, signal?: AbortSignal, onProgress?: (progress: OfflineDownloadProgress) => void) { return savePackage(userId, 'map', map.id, map, map.name, null, options, signal, onProgress) }
export async function downloadTripOfflinePackage(userId: string, map: PoiMap, tripId: string, options: OfflinePackageOptions, signal?: AbortSignal, onProgress?: (progress: OfflineDownloadProgress) => void) {
  const trip = await getTrip(tripId, signal)
  return savePackage(userId, 'trip', trip.id, map, trip.name, trip, options, signal, onProgress)
}
export const defaultMapOfflineOptions: OfflinePackageOptions = { places: true, organization: true, trip: false, annotations: true, routeGeometry: false, thumbnails: true }
export const defaultTripOfflineOptions: OfflinePackageOptions = { places: true, organization: true, trip: true, annotations: true, routeGeometry: true, thumbnails: true }

async function currentPackages() { const identity = await getOfflineIdentity(); return identity ? listOfflinePackages(identity.id) : [] }
export async function offlineMaps(): Promise<PoiMap[]> { return (await currentPackages()).map((item) => item.snapshot.map).filter((map, index, maps) => maps.findIndex((item) => item.id === map.id) === index) }
export async function offlineTrip(id: string): Promise<Trip | null> { return (await currentPackages()).find((item) => item.kind === 'trip' && item.sourceId === id)?.snapshot.trip ?? null }
export async function offlineTrips(mapId: string): Promise<Trip[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId && item.snapshot.trip ? [item.snapshot.trip] : []).filter((trip, index, all) => all.findIndex((item) => item.id === trip.id) === index) }
export async function offlinePlaces(mapId: string): Promise<PlaceDetails[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.places : []).filter((place, index, places) => places.findIndex((item) => item.id === place.id) === index) }
export async function offlinePlace(id: string): Promise<PlaceDetails | null> { return (await currentPackages()).flatMap((item) => item.snapshot.places).find((place) => place.id === id) ?? null }
export async function offlinePhotos(placeId: string): Promise<Photo[]> { return (await currentPackages()).flatMap((item) => item.snapshot.photos[placeId] ?? []).filter((photo, index, all) => all.findIndex((item) => item.id === photo.id) === index) }
export async function offlineThumbnail(photoId: string): Promise<Blob | null> { return (await currentPackages()).map((item) => item.snapshot.thumbnails[photoId]).find((item): item is Blob => item instanceof Blob) ?? null }
export async function offlineAnnotations(placeId: string): Promise<PlaceAnnotation[]> { return (await currentPackages()).flatMap((item) => item.snapshot.annotations?.[placeId] ?? []).filter((item, index, all) => all.findIndex((annotation) => annotation.id === item.id) === index) }
export async function offlineStatuses(mapId: string): Promise<PlaceStatus[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.statuses : []).filter((item, index, all) => all.findIndex((status) => status.id === item.id) === index) }
export async function offlineCategories(mapId: string): Promise<CategoryRead[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.categories : []).filter((item, index, all) => all.findIndex((category) => category.id === item.id) === index) }
export async function offlineTags(mapId: string): Promise<TagRead[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.tags : []).filter((item, index, all) => all.findIndex((tag) => tag.id === item.id) === index) }
export { isNetworkFailure }
