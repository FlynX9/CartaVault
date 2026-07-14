import type { ReactNode } from 'react'

interface WorkspacePanelHeaderProps { eyebrow: string; title: string; count: string; action?: ReactNode; titleId?: string }

export function WorkspacePanelHeader({ eyebrow, title, count, action, titleId }: WorkspacePanelHeaderProps) {
  return <header className="cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">{eyebrow}</p><h2 id={titleId} className="cv-workspace-panel__title">{title}</h2></div><div className="cv-workspace-panel__header-actions"><span className="cv-workspace-panel__count">{count}</span>{action}</div></header>
}
