export interface CategoryRead {
  id: string
  name: string
  description: string | null
  icon?: string
}

export interface CategoryCreatePayload {
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
  name: string
}

export interface TagCreatePayload {
  name: string
}

export interface TagUpdatePayload {
  name?: string
}
