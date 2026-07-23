export interface CategoryRead {
  id: string
  map_id?: string
  name: string
  description: string | null
  icon?: string
  marks_as_visited?: boolean
}

export interface CategoryCreatePayload {
  map_id?: string
  name: string
  description?: string | null
  icon?: string
  marks_as_visited?: boolean
}

export interface CategoryUpdatePayload {
  name?: string
  description?: string | null
  icon?: string
  marks_as_visited?: boolean
}

export interface TagRead {
  id: string
  map_id?: string
  name: string
  color: string
}

export interface TagCreatePayload {
  map_id?: string
  name: string
  color?: string
}

export interface TagUpdatePayload {
  name?: string
  color?: string
}
