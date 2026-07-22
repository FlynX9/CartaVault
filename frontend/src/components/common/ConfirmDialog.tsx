import { AlertTriangle, X } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '../../hooks/useModalFocus'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Supprimer', onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  useModalFocus({ dialogRef, initialFocusRef: cancelButtonRef, onEscape: onCancel })

  return createPortal(<div className="cv-overlay confirmation-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section ref={dialogRef} className="cv-modal confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-dialog-title" aria-describedby="confirmation-dialog-message">
      <header><span className="confirmation-dialog__icon" aria-hidden="true"><AlertTriangle size={18} /></span><div><p className="cv-workspace-panel__eyebrow">Confirmation</p><h2 id="confirmation-dialog-title">{title}</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" onClick={onCancel}><X size={17} /></button></header>
      <p id="confirmation-dialog-message">{message}</p>
      <footer><button ref={cancelButtonRef} className="secondary-button" type="button" onClick={onCancel}>Annuler</button><button className="danger-button" type="button" onClick={onConfirm}>{confirmLabel}</button></footer>
    </section>
  </div>, document.body)
}
