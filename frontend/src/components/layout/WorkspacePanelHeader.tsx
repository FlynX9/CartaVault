import { Minus, Plus, X } from 'lucide-react'
import { useContext, type ReactNode } from 'react'

import { WorkspacePanelCloseContext } from './WorkspacePanelCloseContext'

interface WorkspacePanelHeaderProps { eyebrow: string; title: string; count: string; action?: ReactNode; titleId?: string; onClose?: () => void }

export function WorkspacePanelHeader({ eyebrow, title, count, action, titleId, onClose }: WorkspacePanelHeaderProps) {
  const visibleEyebrow = eyebrow === 'Configuration' ? 'Organisation' : eyebrow
  const collapseControls = useContext(WorkspacePanelCloseContext)
  const closeHandler = onClose

  return <header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">{visibleEyebrow}</p><h2 id={titleId} className="cv-workspace-panel__title">{title}</h2></div><div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{count}</span>{action}{collapseControls && <button className="panel-icon-button workspace-panel-collapse-toggle" type="button" aria-label={collapseControls.collapsed ? 'Agrandir le panneau' : 'Réduire le panneau'} title={collapseControls.collapsed ? 'Agrandir' : 'Réduire'} aria-expanded={!collapseControls.collapsed} onClick={collapseControls.onToggleCollapsed}>{collapseControls.collapsed ? <Plus size={18} /> : <Minus size={18} />}</button>}{closeHandler && <button className="panel-icon-button" type="button" aria-label="Fermer le panneau" title="Fermer" onClick={closeHandler}><X size={18} /></button>}</div></header>
}
