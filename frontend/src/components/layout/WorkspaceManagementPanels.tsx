import type { ReactNode } from 'react'

import { categoriesConfig, tagsConfig } from '../admin/entityManagementConfigs'
import { EntityManagementPage } from '../../pages/admin/EntityManagementPage'
import { StatusesPanel } from '../../pages/admin/StatusesPage'
import { UsersPage } from '../../pages/admin/UsersPage'
import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'

interface WorkspaceManagementPanelProps { id: string; label: string; children: ReactNode; onClose: () => void }

function WorkspaceManagementPanel({ id, label, children, onClose }: WorkspaceManagementPanelProps) {
  return <aside id={id} className="country-place-panel workspace-management-panel cv-workspace-panel" aria-label={label} tabIndex={-1}><WorkspacePanelCloseContext.Provider value={onClose}>{children}</WorkspacePanelCloseContext.Provider></aside>
}

interface ScopedPanelProps { mapId?: string; canEdit?: boolean; onClose?: () => void }

export function CategoriesWorkspacePanel({ mapId, canEdit = true, onClose = () => undefined }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-categories-panel" label="Gestion des catégories" onClose={onClose}><EntityManagementPage config={categoriesConfig(mapId)} variant="panel" readOnly={!canEdit} /></WorkspaceManagementPanel>
}

export function TagsWorkspacePanel({ mapId, canEdit = true, onClose = () => undefined }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-tags-panel" label="Gestion des tags" onClose={onClose}><EntityManagementPage config={tagsConfig(mapId)} variant="panel" readOnly={!canEdit} /></WorkspaceManagementPanel>
}

export function StatusesWorkspacePanel({ mapId, canEdit = true, onClose = () => undefined }: ScopedPanelProps) {
  return <WorkspaceManagementPanel id="workspace-statuses-panel" label="Gestion des statuts" onClose={onClose}><StatusesPanel variant="panel" mapId={mapId} canEdit={canEdit} /></WorkspaceManagementPanel>
}

export function UsersWorkspacePanel({ onClose = () => undefined }: { onClose?: () => void }) {
  return <WorkspaceManagementPanel id="workspace-admin-panel" label="Administration des utilisateurs" onClose={onClose}><UsersPage /></WorkspaceManagementPanel>
}
