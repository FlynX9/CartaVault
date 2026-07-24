import type { ReactNode } from 'react'

import { categoriesConfig, tagsConfig } from '../admin/entityManagementConfigs'
import { EntityManagementPage } from '../../pages/admin/EntityManagementPage'
import { StatusesPanel } from '../../pages/admin/StatusesPage'
import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'

interface WorkspaceManagementPanelProps {
  id: string
  label: string
  children: ReactNode
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

function WorkspaceManagementPanel({ id, label, children, collapsed, onCollapsedChange }: WorkspaceManagementPanelProps) {
  return <aside id={id} className={`country-place-panel workspace-management-panel cv-workspace-panel${collapsed ? ' is-collapsed' : ''}`} aria-label={label} tabIndex={-1}>
    <WorkspacePanelCloseContext.Provider value={{ collapsed, onToggleCollapsed: () => onCollapsedChange(!collapsed) }}>
      {children}
    </WorkspacePanelCloseContext.Provider>
  </aside>
}

interface ScopedPanelProps {
  mapId?: string
  canEdit?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onClose?: () => void
}

export function CategoriesWorkspacePanel({ mapId, canEdit = true, collapsed = false, onCollapsedChange, onClose }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-categories-panel" label="Gestion des catégories" collapsed={collapsed} onCollapsedChange={onCollapsedChange ?? (() => onClose?.())}>
    <EntityManagementPage config={categoriesConfig(mapId)} variant="panel" readOnly={!canEdit} />
  </WorkspaceManagementPanel>
}

export function TagsWorkspacePanel({ mapId, canEdit = true, collapsed = false, onCollapsedChange, onClose }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-tags-panel" label="Gestion des tags" collapsed={collapsed} onCollapsedChange={onCollapsedChange ?? (() => onClose?.())}>
    <EntityManagementPage config={tagsConfig(mapId)} variant="panel" readOnly={!canEdit} />
  </WorkspaceManagementPanel>
}

export function StatusesWorkspacePanel({ mapId, canEdit = true, collapsed = false, onCollapsedChange, onClose }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-statuses-panel" label="Gestion des statuts" collapsed={collapsed} onCollapsedChange={onCollapsedChange ?? (() => onClose?.())}>
    <StatusesPanel variant="panel" mapId={mapId} canEdit={canEdit} />
  </WorkspaceManagementPanel>
}
