export type TrashItemType = 'map' | 'place' | 'trip'

export interface TrashItem {
  id: string
  item_type: TrashItemType
  name: string
  map_id: string | null
  map_name: string | null
  deleted_at: string
  purge_after: string
  days_remaining: number
  can_restore: boolean
  can_delete_permanently: boolean
}
