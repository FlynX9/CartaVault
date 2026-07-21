import { useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Route, X } from 'lucide-react'

import type { TripCreatePayload } from '../../api/trips'
import { useModalFocus } from '../../hooks/useModalFocus'

interface Props {
  mapName: string
  onClose: () => void
  onCreate: (payload: TripCreatePayload) => Promise<void>
}

export function CreateTripDialog({ mapName, onClose, onCreate }: Props) {
  const nameInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useModalFocus({ dialogRef: dialog, initialFocusRef: nameInput, onEscape: busy ? undefined : onClose })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const startDate = String(data.get('start_date') ?? '')
    const endDate = String(data.get('end_date') ?? '')
    if (!name) { setError('Donnez un nom à la sortie.'); return }
    if (startDate && endDate && endDate < startDate) { setError('La date de fin doit suivre la date de début.'); return }
    setBusy(true); setError(null)
    try {
      await onCreate({
        name,
        description: String(data.get('description') ?? '').trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        routing_profile: String(data.get('routing_profile') ?? 'driving') as TripCreatePayload['routing_profile'],
      })
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== 'Internal Server Error' ? caught.message : 'Impossible de créer la sortie pour le moment.')
      setBusy(false)
    }
  }

  return createPortal(<div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} className="create-trip-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="create-trip-title">
      <form onSubmit={(event) => void submit(event)}>
        <header><div><p className="cv-workspace-panel__eyebrow">Nouvelle sortie</p><h2 id="create-trip-title">Préparer une sortie</h2><span>Carte : {mapName}</span></div><button className="panel-icon-button" type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X size={18} /></button></header>
        <div className="create-trip-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          <label className="form-field"><span>Nom de la sortie *</span><input ref={nameInput} name="name" maxLength={160} placeholder="Week-end en Belgique" required /></label>
          <label className="form-field"><span>Description</span><textarea name="description" maxLength={10000} rows={3} placeholder="Objectif ou notes générales…" /></label>
          <div className="create-trip-dialog__dates"><label className="form-field"><span>Date de début</span><input name="start_date" type="date" /></label><label className="form-field"><span>Date de fin</span><input name="end_date" type="date" /></label></div>
          <label className="form-field"><span>Mode de déplacement</span><span className="create-trip-dialog__select"><Route size={16} /><select name="routing_profile" defaultValue="driving"><option value="driving">Voiture</option><option value="walking">Marche</option><option value="cycling">Vélo</option></select></span></label>
        </div>
        <footer className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" type="submit" disabled={busy}><CalendarDays size={16} />{busy ? 'Création…' : 'Créer la sortie'}</button></footer>
      </form>
    </section>
  </div>, document.body)
}
