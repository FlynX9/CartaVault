import type { ReactNode } from 'react'

interface EmptyStateAction {
  label: ReactNode
  onClick: () => void
}

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  className?: string
}

/** A context-free empty state: callers provide all text, controls and icons. */
export function EmptyState({ icon, title, description, action, secondaryAction, className = '' }: EmptyStateProps) {
  return <section className={`cv-empty-state ${className}`.trim()} aria-labelledby="empty-state-title">
    {icon && <span className="cv-empty-state__icon" aria-hidden="true">{icon}</span>}
    <div className="cv-empty-state__copy"><h3 id="empty-state-title">{title}</h3>{description && <p>{description}</p>}</div>
    {(action || secondaryAction) && <div className="cv-empty-state__actions">{action && <button className="primary-button" type="button" onClick={action.onClick}>{action.label}</button>}{secondaryAction && <button className="secondary-button" type="button" onClick={secondaryAction.onClick}>{secondaryAction.label}</button>}</div>}
  </section>
}
