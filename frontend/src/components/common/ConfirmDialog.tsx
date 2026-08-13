import { AlertTriangle, CalendarPlus, X } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '../../hooks/useModalFocus'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'positive'
  busy?: boolean
  overlayClassName?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = 'Supprimer', cancelLabel = 'Annuler', variant = 'danger', busy = false, overlayClassName = '', onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  useModalFocus({ dialogRef, initialFocusRef: cancelButtonRef, onEscape: () => { if (!busy) onCancel() } })

  return createPortal(<div className={`cv-overlay confirmation-overlay ${overlayClassName}`.trim()} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section ref={dialogRef} className={`cv-modal confirmation-dialog confirmation-dialog--${variant}`} role="alertdialog" aria-modal="true" aria-labelledby="confirmation-dialog-title" aria-describedby="confirmation-dialog-message">
      <header><span className="confirmation-dialog__icon" aria-hidden="true">{variant === 'positive' ? <CalendarPlus size={18} /> : <AlertTriangle size={18} />}</span><div><p className="cv-workspace-panel__eyebrow">Confirmation</p><h2 id="confirmation-dialog-title">{title}</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={busy} onClick={onCancel}><X size={17} /></button></header>
      <p id="confirmation-dialog-message">{message}</p>
      <footer><button ref={cancelButtonRef} className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button className={variant === 'positive' ? 'positive-button' : 'danger-button'} type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</button></footer>
    </section>
  </div>, document.body)
}
