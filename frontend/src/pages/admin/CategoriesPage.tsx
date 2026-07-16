import { categoriesConfig } from '../../components/admin/entityManagementConfigs'
import { EntityManagementPage } from './EntityManagementPage'

export function CategoriesPage() {
  return <EntityManagementPage config={categoriesConfig()} />
}
