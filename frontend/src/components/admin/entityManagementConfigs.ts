import { createCategory, deleteCategory, getCategories, updateCategory } from '../../api/categories'
import { createTag, deleteTag, getTags, updateTag } from '../../api/tags'
import { DEFAULT_CATEGORY_ICON_ID } from '../../icons/categoryIconCatalog'
import type { CategoryUpdatePayload } from '../../types/admin'
import type { EntityManagementConfig } from '../../pages/admin/EntityManagementPage'
import type { EntityFormValues } from './EntityForm'
import type { ManagedEntity } from './EntityList'
import { DEFAULT_TAG_COLOR, normalizeTagColor } from '../../tags/tagColors'

function normalizeDescription(value: string): string | null {
  const description = value.trim()
  return description === '' ? null : description
}

export const categoriesConfig = (mapId?: string): EntityManagementConfig => ({
  singularLabel: 'une catégorie', pluralLabel: 'Catégories', supportsDescription: true, supportsIcon: true,
  load: (signal, q) => mapId ? getCategories(signal, q, mapId) : getCategories(signal, q),
  save: async (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim(); const description = normalizeDescription(values.description); const icon = values.icon ?? DEFAULT_CATEGORY_ICON_ID
    if (entity === null) return createCategory({ ...(mapId ? { map_id: mapId } : {}), name, description, ...(icon === DEFAULT_CATEGORY_ICON_ID ? {} : { icon }) })
    const payload: CategoryUpdatePayload = {}
    if (name !== entity.name) payload.name = name
    if (description !== (entity.description ?? null)) payload.description = description
    if (entity.icon !== undefined && icon !== entity.icon) payload.icon = icon
    return Object.keys(payload).length === 0 ? entity : updateCategory(entity.id, payload)
  },
  remove: deleteCategory,
})

export const tagsConfig = (mapId?: string): EntityManagementConfig => ({
  singularLabel: 'un tag', pluralLabel: 'Tags', supportsDescription: false, supportsColor: true,
  load: (signal, q) => mapId ? getTags(signal, q, mapId) : getTags(signal, q),
  save: (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim()
    const color = normalizeTagColor(values.color ?? DEFAULT_TAG_COLOR)
    if (entity === null) return createTag({ ...(mapId ? { map_id: mapId } : {}), name, color })
    const payload = {
      ...(name !== entity.name ? { name } : {}),
      ...(color !== normalizeTagColor(entity.color) ? { color } : {}),
    }
    return Object.keys(payload).length === 0 ? Promise.resolve(entity) : updateTag(entity.id, payload)
  },
  remove: deleteTag,
})
