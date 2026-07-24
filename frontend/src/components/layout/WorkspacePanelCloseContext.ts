import { createContext } from 'react'

export interface WorkspacePanelCloseControls {
  collapsed: boolean
  onToggleCollapsed: () => void
}

export const WorkspacePanelCloseContext = createContext<WorkspacePanelCloseControls | null>(null)
