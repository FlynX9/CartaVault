import { createTag, deleteTag, getTags, updateTag } from '../../api/tags'
import type { ManagedEntity } from '../../components/admin/EntityList'
import type { EntityFormValues } from '../../components/admin/EntityForm'
import { EntityManagementPage, type EntityManagementConfig } from './EntityManagementPage'

const tagsConfig: EntityManagementConfig = {
  singularLabel: 'un tag',
  pluralLabel: 'Tags',
  supportsDescription: false,
  load: (signal, q) => getTags(signal, q),
  save: (entity: ManagedEntity | null, values: EntityFormValues) => {
    const name = values.name.trim()
    if (entity === null) return createTag({ name })
    return name === entity.name ? Promise.resolve(entity) : updateTag(entity.id, { name })
  },
  remove: deleteTag,
}

export function TagsPage() {
  return <EntityManagementPage config={tagsConfig} />
}
