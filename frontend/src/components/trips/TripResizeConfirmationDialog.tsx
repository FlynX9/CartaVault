import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '../../hooks/useModalFocus'
import type { TripResizeImpact } from '../../types/trip'

interface Props {
  impact: TripResizeImpact
  busy?: boolean
  stale?: boolean
  labels: {
    title: string
    day: string
    message: string
    stale: string
    requestedEndDate: string
    days: [string, string]
    stops: [string, string]
    nights: [string, string]
    photos: [string, string]
    routes: [string, string]
    cancel: string
    confirm: string
    close: string
  }
  onCancel: () => void
  onConfirm: () => void
}

export function TripResizeConfirmationDialog({ impact, busy = false, stale = false, labels, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  useModalFocus({ dialogRef, initialFocusRef: cancelButtonRef, onEscape: () => { if (!busy) onCancel() } })
  useEffect(() => { cancelButtonRef.current?.focus() }, [])
  const formatDay = (day: TripResizeImpact['removed_days'][number]) =>
    `${labels.day} ${day.day_number}${day.date ? ` - ${day.date}` : ''}${day.title ? ` - ${day.title}` : ''}`
  const formatCount = (templates: [string, string], count: number) => templates[count === 1 ? 0 : 1].replace('{{count}}', String(count))

  return createPortal(
    <div className="cv-overlay confirmation-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section ref={dialogRef} className="cv-modal confirmation-dialog confirmation-dialog--danger" role="alertdialog" aria-modal="true" aria-labelledby="trip-resize-confirmation-title" aria-describedby="trip-resize-confirmation-message" aria-busy={busy}>
        <header><span className="confirmation-dialog__icon" aria-hidden="true"><AlertTriangle size={18} /></span><div><p className="cv-workspace-panel__eyebrow">{labels.title}</p><h2 id="trip-resize-confirmation-title">{labels.title}</h2></div><button className="panel-icon-button" type="button" aria-label={labels.close} disabled={busy} onClick={onCancel}><X size={17} /></button></header>
        <div id="trip-resize-confirmation-message">
          <p>{stale ? labels.stale : labels.message}</p>
          <p>{labels.requestedEndDate.replace('{{date}}', impact.requested_end_date)}</p>
          <ul>
            <li>{formatCount(labels.days, impact.removed_day_count)}</li>
            <li>{formatCount(labels.stops, impact.removed_stop_count)}</li>
            <li>{formatCount(labels.nights, impact.removed_night_count)}</li>
            <li>{formatCount(labels.photos, impact.removed_night_photo_count)}</li>
            <li>{formatCount(labels.routes, impact.removed_route_count + impact.invalidated_retained_route_count)}</li>
          </ul>
          <ul>{impact.removed_days.map((day) => <li key={day.id}>{formatDay(day)}</li>)}</ul>
        </div>
        <footer><button ref={cancelButtonRef} className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{labels.cancel}</button><button className="danger-button" type="button" disabled={busy} onClick={onConfirm}>{labels.confirm}</button></footer>
      </section>
    </div>,
    document.body,
  )
}
