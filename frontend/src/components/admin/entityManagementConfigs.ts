import { createCategory, deleteCategory, getCategories, updateCategory } from '../../api/categories'
import { createTag, deleteTag, getTags, updateTag } from '../../api/tags'
import { DEFAULT_CATEGORY_ICON_ID } from '../../icons/categoryIconCatalog'
import type { CategoryUpdatePayload } from '../../types/admin'
import type { EntityManagementConfig } from '../../pages/admin/EntityManagementPage'
import type { EntityFormValues } from './EntityForm'
import type { ManagedEntity } from './EntityList'

function normalizeDescription(value: string): string | null {
  const description = value.trim()
  return description === '' ? null : description
}

export const categoriesConfig = (mapId?: string): EntityManagementConfig => ({
  singularLabel: 'une catégorie', pluralLabel: 'Catégories', supportsDescription: true, supportsIcon: true, supportsVisited: true,
  load: (signal, q) => mapId ? getCategories(signal, q, mapId) : getCategories(signal, q),
  save: async (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim(); const description = normalizeDescription(values.description); const icon = values.icon ?? DEFAULT_CATEGORY_ICON_ID
    if (entity === null) return createCategory({ ...(mapId ? { map_id: mapId } : {}), name, description, ...(icon === DEFAULT_CATEGORY_ICON_ID ? {} : { icon }), ...(values.marksAsVisited ? { marks_as_visited: true } : {}) })
    const payload: CategoryUpdatePayload = {}
    if (name !== entity.name) payload.name = name
    if (description !== (entity.description ?? null)) payload.description = description
    if (entity.icon !== undefined && icon !== entity.icon) payload.icon = icon
    if (values.marksAsVisited !== (entity.marks_as_visited === true)) payload.marks_as_visited = values.marksAsVisited === true
    return Object.keys(payload).length === 0 ? entity : updateCategory(entity.id, payload)
  },
  remove: deleteCategory,
})

export const tagsConfig = (mapId?: string): EntityManagementConfig => ({
  singularLabel: 'un tag', pluralLabel: 'Tags', supportsDescription: false,
  load: (signal, q) => mapId ? getTags(signal, q, mapId) : getTags(signal, q),
  save: (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim()
    return entity === null ? createTag({ ...(mapId ? { map_id: mapId } : {}), name }) : name === entity.name ? Promise.resolve(entity) : updateTag(entity.id, { name })
  },
  remove: deleteTag,
})
