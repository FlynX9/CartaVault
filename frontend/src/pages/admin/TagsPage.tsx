import { tagsConfig } from '../../components/admin/entityManagementConfigs'
import { EntityManagementPage } from './EntityManagementPage'

export function TagsPage() {
  return <EntityManagementPage config={tagsConfig()} />
}
