import { useEffect, useRef, type ReactNode } from 'react'

interface SidebarHeaderProps {
  title: string
  onClose: () => void
  actions?: ReactNode
}

export function SidebarHeader({ title, onClose, actions = null }: SidebarHeaderProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => closeButton.current?.focus(), [])

  return (
    <header className="sidebar-header">
      <h2>{title}</h2>
      <div className="sidebar-header__actions">{actions}<button
        ref={closeButton}
        className="close-button"
        type="button"
        onClick={onClose}
        aria-label="Fermer le volet"
      >
        ×
      </button></div>
    </header>
  )
}
