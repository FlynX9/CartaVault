import type { ReactNode } from 'react'

import { categoriesConfig, tagsConfig } from '../admin/entityManagementConfigs'
import { EntityManagementPage } from '../../pages/admin/EntityManagementPage'
import { StatusesPanel } from '../../pages/admin/StatusesPage'

interface WorkspaceManagementPanelProps { id: string; label: string; children: ReactNode }

function WorkspaceManagementPanel({ id, label, children }: WorkspaceManagementPanelProps) {
  return <aside id={id} className="country-place-panel workspace-management-panel cv-workspace-panel" aria-label={label} tabIndex={-1}>{children}</aside>
}

export function CategoriesWorkspacePanel() { return <WorkspaceManagementPanel id="workspace-categories-panel" label="Gestion des catégories"><EntityManagementPage config={categoriesConfig} variant="panel" /></WorkspaceManagementPanel> }
export function TagsWorkspacePanel() { return <WorkspaceManagementPanel id="workspace-tags-panel" label="Gestion des tags"><EntityManagementPage config={tagsConfig} variant="panel" /></WorkspaceManagementPanel> }
export function StatusesWorkspacePanel() { return <WorkspaceManagementPanel id="workspace-statuses-panel" label="Gestion des statuts"><StatusesPanel variant="panel" /></WorkspaceManagementPanel> }
