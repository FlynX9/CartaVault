import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPinned, X } from 'lucide-react'

import { getStatuses } from '../../api/statuses'
import { useModalFocus } from '../../hooks/useModalFocus'
import type { PoiMap } from '../../types/map'
import type { PlaceStatusSummary } from '../../types/status'

interface Blockers { categories: number; tags: number; annotations: number; trip_stops: number; trip_nights: number; trip_anchors: number }

interface Props {
  maps: PoiMap[]
  sourceMapId: string
  busy?: boolean
  error?: string | null
  blockers?: Blockers | null
  onClose: () => void
  onMove: (targetMapId: string, targetStatusId: string) => Promise<void>
}

export function MovePlaceDialog({ maps, sourceMapId, busy = false, error = null, blockers = null, onClose, onMove }: Props) {
  const editableMaps = maps.filter((map) => map.id !== sourceMapId && map.can_edit !== false && map.current_user_role !== 'viewer')
  const [targetMapId, setTargetMapId] = useState(editableMaps[0]?.id ?? '')
  const [statuses, setStatuses] = useState<PlaceStatusSummary[]>([])
  const [statusId, setStatusId] = useState('')
  const [loading, setLoading] = useState(Boolean(targetMapId))
  const [attemptError, setAttemptError] = useState<string | null>(error)
  const [attemptBlockers, setAttemptBlockers] = useState<Blockers | null>(blockers)
  const dialogRef = useRef<HTMLElement>(null)
  const mapSelectRef = useRef<HTMLSelectElement>(null)
  useModalFocus({ dialogRef, initialFocusRef: mapSelectRef, onEscape: busy ? undefined : onClose })

  useEffect(() => {
    if (!targetMapId) { setStatuses([]); setStatusId(''); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    void getStatuses(targetMapId, controller.signal, { activeOnly: true }).then((items) => {
      if (controller.signal.aborted) return
      setStatuses(items)
      setStatusId(items.find((item) => item.is_default)?.id ?? items[0]?.id ?? '')
    }).catch(() => {
      if (!controller.signal.aborted) { setStatuses([]); setStatusId('') }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [targetMapId])

  useEffect(() => {
    setAttemptError(error)
    setAttemptBlockers(blockers)
  }, [error, blockers])

  const dependencyLabels = [
    [attemptBlockers?.categories ?? 0, 'catégorie'], [attemptBlockers?.tags ?? 0, 'tag'], [attemptBlockers?.annotations ?? 0, 'annotation'],
    [(attemptBlockers?.trip_stops ?? 0) + (attemptBlockers?.trip_nights ?? 0) + (attemptBlockers?.trip_anchors ?? 0), 'utilisation dans des sorties'],
  ].filter(([count]) => Number(count) > 0) as Array<[number, string]>

  return createPortal(<div className="cv-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={dialogRef} className="create-trip-dialog create-map-dialog cv-modal" role="dialog" aria-modal="true" aria-labelledby="move-place-title">
      <form onSubmit={(event) => { event.preventDefault(); if (targetMapId && statusId && !busy) void onMove(targetMapId, statusId) }}>
        <header className="create-map-dialog__header"><span className="create-map-dialog__header-icon"><MapPinned aria-hidden="true" /></span><div><span>Organisation</span><h2 id="move-place-title">Déplacer vers une autre carte</h2><p>Le statut de suivi doit être choisi sur la carte de destination.</p></div><button type="button" aria-label="Fermer" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
        <div className="create-trip-dialog__body">
          {attemptError && <p className="form-alert" role="alert">{attemptError}</p>}
          {dependencyLabels.length > 0 && <div className="form-alert" role="alert"><strong>Ce lieu ne peut pas encore être déplacé.</strong>{dependencyLabels.map(([count, label]) => <div key={label}>• {count} {label}{count > 1 && label !== 'utilisation dans des sorties' ? 's' : ''}</div>)}</div>}
          <label className="form-field"><span>Carte de destination</span><select ref={mapSelectRef} value={targetMapId} disabled={busy || editableMaps.length === 0} onChange={(event) => { setTargetMapId(event.target.value); setAttemptError(null); setAttemptBlockers(null); setStatusId('') }}><option value="">Choisir une carte</option>{editableMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
          <label className="form-field"><span>Statut de suivi</span><select value={statusId} disabled={busy || loading || statuses.length === 0} onChange={(event) => setStatusId(event.target.value)}><option value="">Choisir un statut</option>{statuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <footer className="dialog-actions"><button className="secondary-button cv-action-button" type="button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button cv-action-button is-primary" type="submit" disabled={busy || !targetMapId || !statusId || dependencyLabels.length > 0}>{busy ? 'Déplacement…' : 'Déplacer le lieu'}</button></footer>
      </form>
    </section>
  </div>, document.body)
}
