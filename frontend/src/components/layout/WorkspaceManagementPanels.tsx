import type { ReactNode } from 'react'

import { categoriesConfig, tagsConfig } from '../admin/entityManagementConfigs'
import { EntityManagementPage } from '../../pages/admin/EntityManagementPage'
import { StatusesPanel } from '../../pages/admin/StatusesPage'
import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'

interface WorkspaceManagementPanelProps { id: string; label: string; children: ReactNode; onClose: () => void }

function WorkspaceManagementPanel({ id, label, children, onClose }: WorkspaceManagementPanelProps) {
  return <aside id={id} className="country-place-panel workspace-management-panel cv-workspace-panel" aria-label={label} tabIndex={-1}><WorkspacePanelCloseContext.Provider value={onClose}>{children}</WorkspacePanelCloseContext.Provider></aside>
}

export function CategoriesWorkspacePanel({ onClose = () => undefined }: { onClose?: () => void }) { return <WorkspaceManagementPanel id="workspace-categories-panel" label="Gestion des catégories" onClose={onClose}><EntityManagementPage config={categoriesConfig} variant="panel" /></WorkspaceManagementPanel> }
export function TagsWorkspacePanel({ onClose = () => undefined }: { onClose?: () => void }) { return <WorkspaceManagementPanel id="workspace-tags-panel" label="Gestion des tags" onClose={onClose}><EntityManagementPage config={tagsConfig} variant="panel" /></WorkspaceManagementPanel> }
export function StatusesWorkspacePanel({ onClose = () => undefined }: { onClose?: () => void }) { return <WorkspaceManagementPanel id="workspace-statuses-panel" label="Gestion des statuts" onClose={onClose}><StatusesPanel variant="panel" /></WorkspaceManagementPanel> }
