import { getJson, sendJson, sendWithoutResponse, setCsrfToken } from './client'
import { isRecord, readArray, readBoolean, readDateTime, readNullableNumber, readNumber, readString, readUuid } from './validation'
import type { CountrySummary, MapCreatePayload, MapInvitation, MapMember, PendingMapInvitation, PoiMap, PublicInvitation } from '../types/map'
import type { AuthUser } from '../auth/authTypes'

function parseCountrySummary(value: unknown): CountrySummary {
  const context = 'Le pays de la carte'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return { id: readUuid(value, 'id', context), iso_alpha2: readString(value, 'iso_alpha2', context), iso_alpha3: readString(value, 'iso_alpha3', context), name: readString(value, 'name', context) }
}

export function parseMap(value: unknown): PoiMap {
  const context = 'La carte renvoyée par l’API'
  if (!isRecord(value)) throw new Error(`${context} est invalide.`)
  return {
    id: readUuid(value, 'id', context), name: readString(value, 'name', context), country_id: readUuid(value, 'country_id', context),
    country: parseCountrySummary(value.country),
    center_latitude: readNullableNumber(value, 'center_latitude', context), center_longitude: readNullableNumber(value, 'center_longitude', context), default_zoom: readNullableNumber(value, 'default_zoom', context),
    effective_center_latitude: readNumber(value, 'effective_center_latitude', context), effective_center_longitude: readNumber(value, 'effective_center_longitude', context), effective_default_zoom: readNumber(value, 'effective_default_zoom', context),
    min_latitude: readNullableNumber(value, 'min_latitude', context), max_latitude: readNullableNumber(value, 'max_latitude', context), min_longitude: readNullableNumber(value, 'min_longitude', context), max_longitude: readNullableNumber(value, 'max_longitude', context),
    created_at: readDateTime(value, 'created_at', context), updated_at: readDateTime(value, 'updated_at', context),
    owner_id: readUuid(value, 'owner_id', context), owner_email: readString(value, 'owner_email', context), owner_display_name: readString(value, 'owner_display_name', context), is_private: readBoolean(value, 'is_private', context), is_shared: readBoolean(value, 'is_shared', context),
    current_user_role: readString(value, 'current_user_role', context) as PoiMap['current_user_role'],
    can_edit: readBoolean(value, 'can_edit', context), can_delete: readBoolean(value, 'can_delete', context),
    can_manage_members: readBoolean(value, 'can_manage_members', context), can_transfer_ownership: readBoolean(value, 'can_transfer_ownership', context),
    can_import: readBoolean(value, 'can_import', context), can_export: readBoolean(value, 'can_export', context),
    place_field_config: isRecord(value.place_field_config) ? Object.fromEntries(Object.entries(value.place_field_config).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) : {},
  }
}

export async function updateMapPlaceFields(mapId: string, fields: Record<string, boolean>): Promise<Record<string, boolean>> {
  const value = await sendJson(`/maps/${encodeURIComponent(mapId)}/place-fields`, 'PUT', { fields })
  return isRecord(value) && isRecord(value.fields) ? Object.fromEntries(Object.entries(value.fields).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) : {}
}

export async function getMaps(signal?: AbortSignal): Promise<PoiMap[]> {
  const payload = await getJson('/maps', new URLSearchParams(), signal)
  return readArray({ items: payload }, 'items', 'La liste des cartes').map(parseMap)
}

export async function createMap(payload: MapCreatePayload): Promise<PoiMap> {
  return parseMap(await sendJson('/maps', 'POST', payload))
}

export async function deleteMap(mapId: string): Promise<void> {
  await sendWithoutResponse(`/maps/${encodeURIComponent(mapId)}`, 'DELETE')
}

export async function getMapMembers(mapId: string, signal?: AbortSignal): Promise<MapMember[]> {
  return getJson(`/maps/${encodeURIComponent(mapId)}/members`, new URLSearchParams(), signal) as Promise<MapMember[]>
}

export async function updateMapMember(mapId: string, userId: string, role: 'editor' | 'viewer'): Promise<MapMember> {
  return sendJson(`/maps/${encodeURIComponent(mapId)}/members/${encodeURIComponent(userId)}`, 'PATCH', { role }) as Promise<MapMember>
}

export async function removeMapMember(mapId: string, userId: string): Promise<void> {
  await sendWithoutResponse(`/maps/${encodeURIComponent(mapId)}/members/${encodeURIComponent(userId)}`, 'DELETE')
}

export async function getMapInvitations(mapId: string, signal?: AbortSignal): Promise<MapInvitation[]> {
  return getJson(`/maps/${encodeURIComponent(mapId)}/invitations`, new URLSearchParams(), signal) as Promise<MapInvitation[]>
}

export async function createMapInvitation(mapId: string, email: string, role: 'editor' | 'viewer'): Promise<MapInvitation> {
  return sendJson(`/maps/${encodeURIComponent(mapId)}/invitations`, 'POST', { email, role }) as Promise<MapInvitation>
}

export async function revokeMapInvitation(mapId: string, invitationId: string): Promise<void> {
  await sendWithoutResponse(`/maps/${encodeURIComponent(mapId)}/invitations/${encodeURIComponent(invitationId)}`, 'DELETE')
}

export async function transferMapOwnership(mapId: string, userId: string): Promise<PoiMap> {
  return parseMap(await sendJson(`/maps/${encodeURIComponent(mapId)}/transfer-ownership`, 'POST', { new_owner_user_id: userId }))
}

export async function getInvitation(token: string, signal?: AbortSignal): Promise<PublicInvitation> {
  return getJson(`/invitations/${encodeURIComponent(token)}`, new URLSearchParams(), signal) as Promise<PublicInvitation>
}

export async function acceptInvitation(token: string, account?: { display_name: string; password: string }): Promise<AuthUser> {
  const user = await sendJson(`/invitations/${encodeURIComponent(token)}/accept`, 'POST', account ?? {}) as AuthUser
  setCsrfToken(user.csrf_token)
  return user
}

export async function getPendingMapInvitations(signal?: AbortSignal): Promise<PendingMapInvitation[]> {
  return getJson('/invitations/pending', new URLSearchParams(), signal) as Promise<PendingMapInvitation[]>
}

export async function acceptPendingMapInvitation(invitationId: string): Promise<void> {
  await sendWithoutResponse(`/invitations/pending/${encodeURIComponent(invitationId)}/accept`, 'POST')
}

export async function declinePendingMapInvitation(invitationId: string): Promise<void> {
  await sendWithoutResponse(`/invitations/pending/${encodeURIComponent(invitationId)}/decline`, 'POST')
}
