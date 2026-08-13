import { AlertTriangle, Save, X } from 'lucide-react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '../../hooks/useModalFocus'

interface Props {
  saving: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function UnsavedChangesDialog({ saving, onCancel, onDiscard, onSave }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  useModalFocus({ dialogRef, initialFocusRef: cancelButtonRef, onEscape: onCancel })

  return createPortal(<div className="cv-overlay confirmation-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}>
    <section ref={dialogRef} className="cv-modal confirmation-dialog unsaved-changes-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-changes-title" aria-describedby="unsaved-changes-message">
      <header><span className="confirmation-dialog__icon" aria-hidden="true"><AlertTriangle size={18} /></span><div><p className="cv-workspace-panel__eyebrow">Modifications non enregistrées</p><h2 id="unsaved-changes-title">Enregistrer les paramètres ?</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={saving} onClick={onCancel}><X size={17} /></button></header>
      <p id="unsaved-changes-message">Des modifications sont en attente. Enregistrez-les avant de fermer pour ne pas perdre vos changements.</p>
      <footer><button ref={cancelButtonRef} className="secondary-button" type="button" disabled={saving} onClick={onCancel}>Annuler</button><button className="secondary-button unsaved-changes-dialog__discard" type="button" disabled={saving} onClick={onDiscard}>Ne pas enregistrer</button><button className="primary-button" type="button" disabled={saving} onClick={onSave}><Save size={14} />{saving ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
    </section>
  </div>, document.body)
}
