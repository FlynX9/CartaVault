import { getCategories } from '../api/categories'
import { getPhotoFileUrl, getPlacePhotos } from '../api/photos'
import { getPlaces, getPlaceDetails } from '../api/places'
import { getStatuses } from '../api/statuses'
import { getTags } from '../api/tags'
import { getTrip } from '../api/trips'
import type { CategoryRead, TagRead } from '../types/admin'
import type { PoiMap } from '../types/map'
import type { Photo } from '../types/photo'
import type { PlaceDetails } from '../types/place'
import type { PlaceStatus } from '../types/status'
import type { Trip } from '../types/trip'

const DB_NAME = 'cartavault-offline'
const DB_VERSION = 1
const PACKAGE_STORE = 'packages'
const IDENTITY_STORE = 'identities'
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
}
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
}
export interface OfflineIdentity { id: string; email: string; display_name: string; is_admin: boolean }

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
  return items.filter((item) => item.schemaVersion === SCHEMA_VERSION).sort((left, right) => right.lastSyncedAt.localeCompare(left.lastSyncedAt))
}
export async function getOfflinePackage(userId: string, kind: OfflinePackageKind, sourceId: string): Promise<OfflinePackage | null> {
  const result = await transaction<OfflinePackage | undefined>(PACKAGE_STORE, 'readonly', (store) => store.index('by-source').get([userId, kind, sourceId]))
  return result?.schemaVersion === SCHEMA_VERSION ? result : null
}
export async function deleteOfflinePackage(id: string): Promise<void> { await transaction(PACKAGE_STORE, 'readwrite', (store) => store.delete(id)) }
export async function clearOfflineDataForUser(userId: string): Promise<void> {
  const packages = await listOfflinePackages(userId)
  await Promise.all(packages.map((item) => deleteOfflinePackage(item.id)))
  await transaction(IDENTITY_STORE, 'readwrite', (store) => store.delete(userId))
  if (window.localStorage.getItem(ACTIVE_USER_KEY) === userId) window.localStorage.removeItem(ACTIVE_USER_KEY)
}
export async function reconcileOfflinePackages(visibleMapIds: readonly string[]): Promise<void> {
  const identity = await getOfflineIdentity()
  if (!identity) return
  const packages = await listOfflinePackages(identity.id)
  await Promise.all(packages.filter((item) => !visibleMapIds.includes(item.mapId)).map((item) => deleteOfflinePackage(item.id)))
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
  return { map, places, categories, tags, statuses, trip: options.trip ? trip : null, photos, thumbnails: options.thumbnails ? await thumbnailsFor(photos, signal) : {} }
}
async function savePackage(userId: string, kind: OfflinePackageKind, sourceId: string, map: PoiMap, title: string, trip: Trip | null, options: OfflinePackageOptions, signal?: AbortSignal): Promise<OfflinePackage> {
  const snapshot = await buildSnapshot(map, trip, options, signal)
  const current = await getOfflinePackage(userId, kind, sourceId)
  const timestamp = now()
  const byteSize = sizeOf(snapshot) + Object.values(snapshot.thumbnails).reduce((total, thumbnail) => total + thumbnail.size, 0)
  const value: OfflinePackage = { id: packageId(userId, kind, sourceId), kind, sourceId, mapId: map.id, userId, title, schemaVersion: SCHEMA_VERSION, revision: `${map.updated_at}:${trip?.updated_at ?? ''}`, included: options, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp, lastSyncedAt: timestamp, estimatedBytes: byteSize, actualBytes: byteSize, snapshot }
  try { await transaction(PACKAGE_STORE, 'readwrite', (store) => store.put(value)) } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('Espace de stockage insuffisant pour les données hors ligne.')
    throw error
  }
  return value
}
export async function downloadMapOfflinePackage(userId: string, map: PoiMap, options: OfflinePackageOptions, signal?: AbortSignal) { return savePackage(userId, 'map', map.id, map, map.name, null, options, signal) }
export async function downloadTripOfflinePackage(userId: string, map: PoiMap, tripId: string, options: OfflinePackageOptions, signal?: AbortSignal) {
  const trip = await getTrip(tripId, signal)
  return savePackage(userId, 'trip', trip.id, map, trip.name, trip, options, signal)
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
export async function offlineStatuses(mapId: string): Promise<PlaceStatus[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.statuses : []).filter((item, index, all) => all.findIndex((status) => status.id === item.id) === index) }
export async function offlineCategories(mapId: string): Promise<CategoryRead[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.categories : []).filter((item, index, all) => all.findIndex((category) => category.id === item.id) === index) }
export async function offlineTags(mapId: string): Promise<TagRead[]> { return (await currentPackages()).flatMap((item) => item.mapId === mapId ? item.snapshot.tags : []).filter((item, index, all) => all.findIndex((tag) => tag.id === item.id) === index) }
export { isNetworkFailure }
