import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'

import type { Trip, TripDay, TripDayTimeSummary, TripDayTimingPayload, TripLoadSettings, TripStop } from '../../types/trip'
import { formatClock, formatMinutes, formatRouteDistance, formatScheduleDelta } from './tripMetrics'

interface DayTimingProps {
  day: TripDay
  summary: TripDayTimeSummary | undefined
  canEdit: boolean
  busy: boolean
  endsAtHotel?: boolean
  onSave: (payload: TripDayTimingPayload) => Promise<void>
}

export function DayTimingSettings({ day, summary, canEdit, busy, endsAtHotel = false, onSave }: DayTimingProps) {
  const [draft, setDraft] = useState<TripDayTimingPayload>(() => timingPayload(day))
  useEffect(() => setDraft(timingPayload(day)), [day])

  const update = <K extends keyof TripDayTimingPayload>(key: K, value: TripDayTimingPayload[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const bufferPresets = [0, 5, 10, 15, 20, 30]
  const marginPresets = draft.safety_margin_type === 'fixed' ? [0, 15, 30, 45, 60] : [0, 5, 10, 15, 20]
  return <details className="trip-time-settings">
    <summary><span id={`day-${day.id}-planning-title`}>Planification horaire</span><ChevronDown className="trip-panel-chevron" size={15} /></summary>
    <div className="trip-time-settings__body" aria-labelledby={`day-${day.id}-planning-title`}>
    <div className="trip-time-settings__grid">
      <label>{endsAtHotel ? 'Arrivée souhaitée à l’hôtel' : 'Heure cible de fin de journée'}<input aria-label={endsAtHotel ? 'Arrivée souhaitée à l’hôtel' : 'Heure cible de fin de journée'} type="time" value={draft.target_arrival_time ?? ''} disabled={!canEdit || busy} onChange={(event) => update('target_arrival_time', event.target.value || null)} /><small>CartaVault utilisera cette heure pour proposer une heure de départ.</small></label>
      <label>Temps tampon entre les étapes<span className="trip-time-settings__combined"><select aria-label="Préréglage du temps tampon" value={bufferPresets.includes(draft.default_stop_buffer_minutes) ? draft.default_stop_buffer_minutes : 'custom'} disabled={!canEdit || busy} onChange={(event) => { if (event.target.value !== 'custom') update('default_stop_buffer_minutes', Number(event.target.value)) }}>{bufferPresets.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}<option value="custom">Personnalisé</option></select>{!bufferPresets.includes(draft.default_stop_buffer_minutes) && <input aria-label="Temps tampon personnalisé" type="number" min="0" max="720" step="5" value={draft.default_stop_buffer_minutes} disabled={!canEdit || busy} onChange={(event) => update('default_stop_buffer_minutes', Number(event.target.value))} />}</span><small>Temps ajouté entre deux visites pour le stationnement, la préparation et les petits retards.</small></label>
      <label>Marge de sécurité<span className="trip-time-settings__combined"><select aria-label="Type de marge" value={draft.safety_margin_type} disabled={!canEdit || busy} onChange={(event) => update('safety_margin_type', event.target.value as TripDayTimingPayload['safety_margin_type'])}><option value="fixed">Minutes</option><option value="percentage">Pourcentage</option></select><select aria-label="Valeur de la marge" value={marginPresets.includes(draft.safety_margin_value) ? draft.safety_margin_value : 'custom'} disabled={!canEdit || busy} onChange={(event) => { if (event.target.value !== 'custom') update('safety_margin_value', Number(event.target.value)) }}>{marginPresets.map((value) => <option key={value} value={value}>{value}{draft.safety_margin_type === 'percentage' ? ' %' : ' min'}</option>)}<option value="custom">Personnalisée</option></select></span>{!marginPresets.includes(draft.safety_margin_value) && <input aria-label="Marge personnalisée" type="number" min="0" max={draft.safety_margin_type === 'percentage' ? 100 : 720} value={draft.safety_margin_value} disabled={!canEdit || busy} onChange={(event) => update('safety_margin_value', Number(event.target.value))} />}</label>
    </div>
    {summary && <div className="trip-time-settings__results" aria-live="polite">
      <span>Arrivée estimée <strong>{formatClock(summary.estimated_arrival_time, summary.estimated_arrival_day_offset)}</strong></span>
      <span>Écart <strong>{formatScheduleDelta(summary.schedule_delta_minutes)}</strong></span>
    </div>}
    {canEdit && <div className="trip-time-settings__actions"><button className="primary" type="button" disabled={busy} onClick={() => void onSave(draft)}>Enregistrer</button></div>}
    </div>
  </details>
}

export function DayTimeSummary({ day, summary }: { day: TripDay; summary: TripDayTimeSummary | undefined }) {
  if (!summary) return <p className="trip-metrics-warning">Résumé horaire indisponible.</p>
  return <details className={`trip-day-planning-summary${summary.is_time_summary_complete ? '' : ' is-incomplete'}`} aria-label={`Planification du jour ${day.day_number}`}>
    <summary><span>Bilan de la journée</span><strong>{formatRouteDistance(summary.route_distance_meters)}</strong><ChevronDown className="trip-panel-chevron" size={15} /></summary>
    <div className="trip-day-planning-summary__body">
    <section><strong>Trajet</strong><dl><Metric label="Route" value={formatRouteDistance(summary.route_distance_meters)} /><Metric label="Conduite" value={formatMinutes(summary.route_duration_minutes)} /></dl></section>
    <section><strong>Planification</strong><dl><Metric label="Visites" value={formatMinutes(summary.visit_duration_minutes)} /><Metric label="Tampon" value={formatMinutes(summary.buffer_duration_minutes)} /><Metric label="Marge" value={formatMinutes(summary.safety_margin_minutes)} /><Metric label="Total" value={formatMinutes(summary.total_duration_minutes)} /></dl></section>
    <section><strong>Horaires</strong><dl><Metric label="Arrivée cible" value={formatClock(summary.target_arrival_time)} /><Metric label="Départ recommandé" value={formatClock(summary.recommended_start_time, summary.recommended_start_day_offset)} /></dl></section>
    {!summary.has_current_route && <p className="trip-metrics-warning">{summary.route_is_stale ? 'Itinéraire à recalculer.' : 'Itinéraire non calculé.'}</p>}
    </div>
  </details>
}

export function LoadBadge({ summary }: { summary: TripDayTimeSummary }) {
  const labels = { low: 'Charge légère', medium: 'Charge moyenne', high: 'Charge élevée', unavailable: 'Charge indisponible' }
  return <span className="trip-load-badge" style={summary.load_color ? { '--trip-load-color': summary.load_color } as CSSProperties : undefined}>{labels[summary.load_level]}{summary.total_duration_minutes !== null ? ` — ${formatMinutes(summary.total_duration_minutes)}` : ''}</span>
}

export function VisitDurationControl({ stop, disabled, onChange }: { stop: TripStop; disabled: boolean; onChange: (minutes: number) => Promise<void> }) {
  const value = stop.visit_duration_minutes ?? 0
  const presets = [15, 30, 45, 60, 90, 120]
  const preset = presets.includes(value)
  return <label className="trip-visit-duration"><span className="sr-only">Durée de visite pour {stop.name}</span><select aria-label={`Durée de visite pour ${stop.name}`} value={preset ? String(value) : 'custom'} disabled={disabled} onChange={(event) => { if (event.target.value !== 'custom') void onChange(Number(event.target.value)) }}>{presets.map((minutes) => <option key={minutes} value={minutes}>{formatMinutes(minutes)}</option>)}<option value="custom">Personnalisée</option></select>{!preset && <input aria-label={`Durée personnalisée pour ${stop.name}`} type="number" min="0" max="1440" value={value} disabled={disabled} onChange={(event) => void onChange(Number(event.target.value))} />}</label>
}

export function TripLoadSettingsForm({ trip, canEdit, busy, onSave, value, onChange, embedded = false }: { trip: Trip; canEdit: boolean; busy: boolean; onSave?: (settings: TripLoadSettings) => Promise<void>; value?: TripLoadSettings; onChange?: (settings: TripLoadSettings) => void; embedded?: boolean }) {
  const defaults: TripLoadSettings = { low_load_max_minutes: 240, medium_load_max_minutes: 480, low_load_color: '#0FA68A', medium_load_color: '#D97706', high_load_color: '#DC2626' }
  const [draft, setDraft] = useState<TripLoadSettings>(() => loadSettings(trip))
  useEffect(() => setDraft(loadSettings(trip)), [trip])
  const current = value ?? draft
  const update = <K extends keyof TripLoadSettings>(key: K, nextValue: TripLoadSettings[K]) => {
    const next = { ...current, [key]: nextValue }
    setDraft(next)
    onChange?.(next)
  }
  const fields = <><div><label>Charge faible jusqu’à<input type="number" min="1" max="1440" value={current.low_load_max_minutes} disabled={!canEdit || busy} onChange={(event) => update('low_load_max_minutes', Number(event.target.value))} /></label><label>Charge modérée jusqu’à<input type="number" min="1" max="2880" value={current.medium_load_max_minutes} disabled={!canEdit || busy} onChange={(event) => update('medium_load_max_minutes', Number(event.target.value))} /></label><label>Couleur faible<input type="color" value={current.low_load_color} disabled={!canEdit || busy} onChange={(event) => update('low_load_color', event.target.value.toUpperCase())} /></label><label>Couleur modérée<input type="color" value={current.medium_load_color} disabled={!canEdit || busy} onChange={(event) => update('medium_load_color', event.target.value.toUpperCase())} /></label><label>Couleur élevée<input type="color" value={current.high_load_color} disabled={!canEdit || busy} onChange={(event) => update('high_load_color', event.target.value.toUpperCase())} /></label></div><div className="trip-load-preview" aria-label="Prévisualisation des niveaux de charge"><span style={{ '--trip-load-color': current.low_load_color } as CSSProperties}>Faible</span><span style={{ '--trip-load-color': current.medium_load_color } as CSSProperties}>Modérée</span><span style={{ '--trip-load-color': current.high_load_color } as CSSProperties}>Élevée</span></div></>
  if (embedded) return <section className="trip-load-settings trip-load-settings-embedded"><h3>Charge des journées</h3>{fields}</section>
  return <details className="trip-load-settings"><summary>Charge des journées</summary>{fields}{canEdit && onSave && <footer><button type="button" disabled={busy} onClick={() => { setDraft(defaults); onChange?.(defaults); void onSave(defaults) }}>Réinitialiser</button><button className="primary" type="button" disabled={busy || current.low_load_max_minutes >= current.medium_load_max_minutes} onClick={() => void onSave(current)}>Enregistrer</button></footer>}</details>
}

function timingPayload(day: TripDay): TripDayTimingPayload { return { target_arrival_time: day.target_arrival_time ?? '20:00', default_stop_buffer_minutes: day.default_stop_buffer_minutes, safety_margin_type: day.safety_margin_type, safety_margin_value: day.safety_margin_value } }
function loadSettings(trip: Trip): TripLoadSettings { return { low_load_max_minutes: trip.low_load_max_minutes, medium_load_max_minutes: trip.medium_load_max_minutes, low_load_color: trip.low_load_color, medium_load_color: trip.medium_load_color, high_load_color: trip.high_load_color } }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd aria-label={`${label} : ${value}`}>{value}</dd></div> }
