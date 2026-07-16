export interface CategoryRead {
  id: string
  map_id?: string
  name: string
  description: string | null
  icon?: string
}

export interface CategoryCreatePayload {
  map_id?: string
  name: string
  description?: string | null
  icon?: string
}

export interface CategoryUpdatePayload {
  name?: string
  description?: string | null
  icon?: string
}

export interface TagRead {
  id: string
  map_id?: string
  name: string
}

export interface TagCreatePayload {
  map_id?: string
  name: string
}

export interface TagUpdatePayload {
  name?: string
}
