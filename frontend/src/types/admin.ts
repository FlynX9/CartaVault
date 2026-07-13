export interface CategoryRead {
  id: string
  name: string
  description: string | null
}

export interface CategoryCreatePayload {
  name: string
  description?: string | null
}

export interface CategoryUpdatePayload {
  name?: string
  description?: string | null
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
