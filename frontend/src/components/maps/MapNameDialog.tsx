import { Copy, Pencil, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { ApiError } from '../../api/client'
import { duplicateMap, updateMap } from '../../api/maps'
import { useModalFocus } from '../../hooks/useModalFocus'
import { useI18n } from '../../i18n/useI18n'
import type { PoiMap } from '../../types/map'

interface Props {
  map: PoiMap
  mode: 'rename' | 'duplicate'
  onClose: () => void
  onSaved: (map: PoiMap) => void
}

export function MapNameDialog({ map, mode, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState(mode === 'rename' ? map.name : `${map.name} - copie`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus({ dialogRef: dialog, initialFocusRef: nameInput, onEscape: busy ? undefined : onClose })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      onSaved(mode === 'rename' ? await updateMap(map.id, { name: trimmed }) : await duplicateMap(map.id, trimmed))
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? t('maps.name.duplicate') : caught instanceof Error ? caught.message : t('maps.name.error'))
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'rename' ? t('maps.rename.title') : t('maps.duplicate.title')
  return <div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialog} className="cv-modal map-action-dialog map-name-dialog" role="dialog" aria-modal="true" aria-labelledby="map-name-dialog-title">
      <form onSubmit={(event) => void submit(event)}>
        <header className="map-action-dialog__header">
          <div><p className="cv-workspace-panel__eyebrow">{t('maps.name.eyebrow')}</p><h2 id="map-name-dialog-title">{title}</h2><span>{t(mode === 'rename' ? 'maps.rename.description' : 'maps.duplicate.description', { name: map.name })}</span></div>
          <button className="panel-icon-button" type="button" aria-label={t('common.close')} onClick={onClose} disabled={busy}><X size={18} /></button>
        </header>
        <div className="map-action-dialog__body">
          {error && <p className="form-alert" role="alert">{error}</p>}
          <label className="form-field"><span>{t('maps.name.label')}</span><input ref={nameInput} value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></label>
        </div>
        <footer className="map-action-dialog__footer dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>{mode === 'rename' ? <Pencil size={16} /> : <Copy size={16} />}{busy ? t('common.loading') : t('common.save')}</button>
        </footer>
      </form>
    </div>
  </div>
}
