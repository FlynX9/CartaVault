import { getJson, sendWithoutResponse } from './client'
import type { TrashItem, TrashItemType } from '../types/trash'

export async function getTrash(itemType: TrashItemType | 'all' = 'all', signal?: AbortSignal): Promise<TrashItem[]> {
  return getJson('/trash', new URLSearchParams({ item_type: itemType }), signal) as Promise<TrashItem[]>
}

export async function restoreTrashItem(itemType: TrashItemType, itemId: string): Promise<void> {
  await sendWithoutResponse(`/trash/${itemType}/${encodeURIComponent(itemId)}/restore`, 'POST')
}

export async function permanentlyDeleteTrashItem(itemType: TrashItemType, itemId: string): Promise<void> {
  await sendWithoutResponse(`/trash/${itemType}/${encodeURIComponent(itemId)}`, 'DELETE')
}
