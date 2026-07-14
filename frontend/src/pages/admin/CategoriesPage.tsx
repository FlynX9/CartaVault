import { createCategory, deleteCategory, getCategories, updateCategory } from '../../api/categories'
import type { CategoryUpdatePayload } from '../../types/admin'
import type { ManagedEntity } from '../../components/admin/EntityList'
import type { EntityFormValues } from '../../components/admin/EntityForm'
import { EntityManagementPage, type EntityManagementConfig } from './EntityManagementPage'

function normalizeDescription(value: string): string | null {
  const description = value.trim()
  return description === '' ? null : description
}

const categoriesConfig: EntityManagementConfig = {
  singularLabel: 'une catégorie',
  pluralLabel: 'Catégories',
  supportsDescription: true,
  supportsIcon: true,
  load: (signal, q) => getCategories(signal, q),
  save: async (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim()
    const description = normalizeDescription(values.description)
    const icon = values.icon ?? 'map-pin'
    if (entity === null) return createCategory(icon === 'map-pin' ? { name, description } : { name, description, icon })
    const payload: CategoryUpdatePayload = {}
    if (name !== entity.name) payload.name = name
    if (description !== (entity.description ?? null)) payload.description = description
    if (entity.icon !== undefined && icon !== entity.icon) payload.icon = icon
    return Object.keys(payload).length === 0 ? entity : updateCategory(entity.id, payload)
  },
  remove: deleteCategory,
}

export function CategoriesPage() {
  return <EntityManagementPage config={categoriesConfig} />
}
