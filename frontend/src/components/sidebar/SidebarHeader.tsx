import { useEffect, useRef } from 'react'

interface SidebarHeaderProps {
  title: string
  onClose: () => void
  onBack?: () => void
}

export function SidebarHeader({ title, onClose, onBack }: SidebarHeaderProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => closeButton.current?.focus(), [])

  return (
    <header className="sidebar-header">
      {onBack && (
        <button className="sidebar-back-button" type="button" onClick={onBack}>
          ← Fiche
        </button>
      )}
      <h2>{title}</h2>
      <button
        ref={closeButton}
        className="close-button"
        type="button"
        onClick={onClose}
        aria-label="Fermer le volet"
      >
        ×
      </button>
    </header>
  )
}
