import { useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, MapPinned, Route, X } from 'lucide-react'

import type { TripCreatePayload } from '../../api/trips'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useI18n } from '../../i18n/useI18n'
import type { PoiMap } from '../../types/map'

interface Props {
  maps: PoiMap[]
  fixedMapId?: string
  onClose: () => void
  onCreate: (mapId: string, payload: TripCreatePayload) => Promise<void>
}

export function CreateTripDialog({ maps, fixedMapId, onClose, onCreate }: Props) {
  const { t } = useI18n()
  const nameInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapId, setMapId] = useState(fixedMapId ?? maps[0]?.id ?? '')

  useModalFocus({ dialogRef: dialog, initialFocusRef: nameInput, onEscape: busy ? undefined : onClose })

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const startDate = String(data.get('start_date') ?? '')
    if (!name || !mapId) { setError(t('trips.createDialog.validation')); return }
    setBusy(true); setError(null)
    try {
      await onCreate(mapId, {
        name,
        description: String(data.get('description') ?? '').trim() || undefined,
        start_date: startDate || undefined,
        routing_profile: String(data.get('routing_profile') ?? 'driving') as TripCreatePayload['routing_profile'],
      })
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== 'Internal Server Error' ? caught.message : t('trips.createDialog.error'))
      setBusy(false)
    }
  }

  return createPortal(<div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialog} className="create-trip-dialog create-map-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="create-trip-title">
      <form onSubmit={(event) => void submit(event)}>
        <header className="create-map-dialog__header"><span className="create-map-dialog__header-icon"><MapPinned aria-hidden="true" /></span><div><span>{t('trips.createDialog.eyebrow')}</span><h2 id="create-trip-title">{t('trips.createDialog.title')}</h2><p>{t('trips.createDialog.description')}</p></div><button type="button" aria-label={t('common.close')} disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
        <div className="create-trip-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          {!fixedMapId && <label className="form-field"><span>{t('trips.createDialog.map')}</span><select value={mapId} onChange={(event) => setMapId(event.target.value)} required>{maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>}
          <label className="form-field"><span>{t('trips.createDialog.name')}</span><input ref={nameInput} name="name" maxLength={160} placeholder={t('trips.createDialog.namePlaceholder')} required /></label>
          <label className="form-field"><span>{t('trips.createDialog.descriptionLabel')}</span><textarea name="description" maxLength={10000} rows={3} placeholder={t('trips.createDialog.descriptionPlaceholder')} /></label>
          <label className="form-field"><span>{t('trips.createDialog.startDate')}</span><input name="start_date" type="date" /></label>
          <label className="form-field"><span>{t('trips.createDialog.routingProfile')}</span><span className="create-trip-dialog__select"><Route size={16} /><select name="routing_profile" defaultValue="driving"><option value="driving">{t('trips.createDialog.driving')}</option><option value="walking">{t('trips.createDialog.walking')}</option><option value="cycling">{t('trips.createDialog.cycling')}</option></select></span></label>
        </div>
        <footer className="dialog-actions"><button className="secondary-button cv-action-button" type="button" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button className="primary-button cv-action-button is-primary" type="submit" disabled={busy || !mapId}><CalendarDays size={16} />{busy ? t('trips.createDialog.submitting') : t('trips.createDialog.submit')}</button></footer>
      </form>
    </section>
  </div>, document.body)
}
