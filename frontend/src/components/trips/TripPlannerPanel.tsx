import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, BedDouble, Check, ChevronDown, Copy, Download, Eye, EyeOff, Flag, GripVertical, Lock, MapPin, Navigation, Pencil, Plus, Route, Save, Trash2, X } from 'lucide-react'

import { addTripArrival, addTripDay, addTripDeparture, addTripNight, addTripStop, calculateTripDayRoute, confirmTripOptimization, createTrip, deleteTrip, deleteTripArrival, deleteTripDay, deleteTripDeparture, deleteTripNight, deleteTripStop, duplicateTrip, duplicateTripDay, exportTripGoogleMaps, exportTripGpx, exportTripKmz, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTripDay, reorderTripDays, reorderTripStops, tripExportUrl, updateTrip, updateTripArrival, updateTripDay, updateTripDayTiming, updateTripDeparture, updateTripLoadSettings, updateTripNight, updateTripStop } from '../../api/trips'
import { getAccountPreferences } from '../../api/account'
import type { PoiMap } from '../../types/map'
import type { Trip, TripDay, TripDayTimeSummary, TripLoadSettings, TripOptimization, TripSummary } from '../../types/trip'
import { CreateTripDialog } from './CreateTripDialog'
import { CreateTripNightDialog } from './CreateTripNightDialog'
import { formatMinutes, formatRouteDistance, formatRouteDuration } from './tripMetrics'
import { DayTimeSummary, DayTimingSettings, LoadBadge, TripLoadSettingsForm, VisitDurationControl } from './TripTimePlanning'

interface Props { poiMap: PoiMap; trip: Trip | null; activeDayId: string | null; tripViewOnly?: boolean; hiddenDayIds?: ReadonlySet<string>; onTripViewOnlyChange?: (enabled: boolean) => void; onDayVisibilityChange?: (dayId: string, visible: boolean) => void; onTripChange: (trip: Trip | null) => void; onActiveDayChange: (id: string | null) => void; onStopFocus?: (latitude: number, longitude: number) => void; onClose: () => void }

export function TripPlannerPanel({ poiMap, trip, activeDayId, tripViewOnly = false, hiddenDayIds = new Set<string>(), onTripViewOnlyChange = () => undefined, onDayVisibilityChange = () => undefined, onTripChange, onActiveDayChange, onStopFocus, onClose }: Props) {
  const canEdit = poiMap.can_edit === true
  const [trips, setTrips] = useState<Trip[]>([])
  const [optimization, setOptimization] = useState<{ dayId: string; value: TripOptimization } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ dayId: string; index: number } | null>(null)
  const [routeFeedback, setRouteFeedback] = useState<string | null>(null)
  const [summary, setSummary] = useState<TripSummary | null>(null)
  const [daySummaries, setDaySummaries] = useState<Record<string, TripDayTimeSummary>>({})
  const [loadSettingsDraft, setLoadSettingsDraft] = useState<TripLoadSettings | null>(null)
  const [loadingTripId, setLoadingTripId] = useState<string | null>(null)
  const [preferredRoutingProvider, setPreferredRoutingProvider] = useState<'osrm' | 'google'>('osrm')
  const activeDayIdRef = useRef(activeDayId)
  const onTripChangeRef = useRef(onTripChange)
  const onActiveDayChangeRef = useRef(onActiveDayChange)
  const loadControllerRef = useRef<AbortController | null>(null)
  const selectionVersionRef = useRef(0)
  onTripChangeRef.current = onTripChange
  onActiveDayChangeRef.current = onActiveDayChange

  useEffect(() => { activeDayIdRef.current = activeDayId }, [activeDayId])
  useEffect(() => { const controller = new AbortController(); void getAccountPreferences(controller.signal).then((value) => setPreferredRoutingProvider(value.routing.provider)).catch(() => undefined); return () => controller.abort() }, [])

  const loadTripDetails = useCallback(async (target: string, signal?: AbortSignal) => {
    const loaded = await getTrip(target, signal)
    const [loadedSummary, perDay] = await Promise.all([getTripSummary(target, signal), Promise.all(loaded.days.map((day) => getTripDaySummary(day.id, signal)))])
    return { loaded, loadedSummary, daySummaries: Object.fromEntries(perDay.map((item) => [item.day_id, item])) }
  }, [])
  const applyLoadedTrip = useCallback(({ loaded, loadedSummary, daySummaries: loadedDays }: Awaited<ReturnType<typeof loadTripDetails>>) => {
    onTripChangeRef.current(loaded); setSummary(loadedSummary); setDaySummaries(loadedDays); setDraftName(loaded.name); setLoadSettingsDraft(readLoadSettings(loaded)); setDirty(false)
    const currentDayId = activeDayIdRef.current
    onActiveDayChangeRef.current(loaded.days.some((day) => day.id === currentDayId) ? currentDayId : loaded.days[0]?.id ?? null)
  }, [])
  const selectTrip = useCallback(async (target: string) => {
    selectionVersionRef.current += 1
    loadControllerRef.current?.abort()
    if (!target) {
      loadControllerRef.current = null
      setLoadingTripId(null); setError(null); setSummary(null); setDaySummaries({})
      onTripChangeRef.current(null); onActiveDayChangeRef.current(null)
      return
    }
    const controller = new AbortController()
    loadControllerRef.current = controller
    setLoadingTripId(target); setError(null); setSummary(null); setDaySummaries({})
    try {
      const details = await loadTripDetails(target, controller.signal)
      if (loadControllerRef.current === controller) applyLoadedTrip(details)
    } catch (caught) {
      if (!controller.signal.aborted && loadControllerRef.current === controller) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    } finally {
      if (loadControllerRef.current === controller) setLoadingTripId(null)
    }
  }, [applyLoadedTrip, loadTripDetails])
  const reload = async (id = trip?.id) => {
    const items = await listTrips(poiMap.id); setTrips(items)
    const target = id && items.some((item) => item.id === id) ? id : items[0]?.id
    if (!target) { loadControllerRef.current?.abort(); onTripChangeRef.current(null); onActiveDayChangeRef.current(null); setSummary(null); setDaySummaries({}); setLoadingTripId(null); return }
    await selectTrip(target)
  }
  useEffect(() => {
    let active = true
    const initialSelectionVersion = selectionVersionRef.current
    void listTrips(poiMap.id).then(async (items) => {
      if (!active) return
      setTrips(items)
      if (!items[0]) { onTripChangeRef.current(null); onActiveDayChangeRef.current(null); return }
      if (active && selectionVersionRef.current === initialSelectionVersion) await selectTrip(items[0].id)
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') })
    return () => { active = false; loadControllerRef.current?.abort() }
  }, [poiMap.id, selectTrip])

  const run = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Opération impossible.') } finally { setBusy(false) } }
  const reorderDays = (index: number, delta: number) => {
    if (!trip) return
    const ids = trip.days.map((day) => day.id); const target = index + delta
    if (target < 0 || target >= ids.length) return
    [ids[index], ids[target]] = [ids[target], ids[index]]
    void run(async () => { await reorderTripDays(trip.id, ids); await reload(trip.id) })
  }
  const reorderStops = (day: TripDay, index: number, delta: number) => {
    const ids = day.stops.map((stop) => stop.id); const target = index + delta
    if (target < 0 || target >= ids.length) return
    [ids[index], ids[target]] = [ids[target], ids[index]]
    void run(async () => { await reorderTripStops(day.id, ids); await reload(trip!.id) })
  }
  const drop = (event: DragEvent, day: TripDay) => {
    event.preventDefault(); const data = event.dataTransfer.getData('text/plain')
    if (data.startsWith('place:')) void run(async () => { await addTripStop(day.id, { place_id: data.slice(6), stop_type: 'place', visit_duration_minutes: 30 }); await reload(trip!.id) })
    if (data.startsWith('stop:')) void run(async () => { await moveTripStop(data.slice(5), day.id, day.stops.length); await reload(trip!.id) })
  }
  const dropStop = (event: DragEvent, day: TripDay, index: number) => {
    event.preventDefault(); event.stopPropagation(); const stopId = event.dataTransfer.getData('text/plain').replace(/^stop:/, '')
    setDraggedStopId(null); setDropTarget(null)
    if (!stopId) return
    void run(async () => { await moveTripStop(stopId, day.id, index); await reload(trip!.id) })
  }
  const recalculateRoute = (day: TripDay) => void run(async () => {
    await calculateTripDayRoute(day.id); await reload(trip!.id); setRouteFeedback(day.id)
    window.setTimeout(() => setRouteFeedback((current) => current === day.id ? null : current), 1600)
  })
  const exportFile = async (kind: 'gpx' | 'kmz') => {
    const item = kind === 'gpx' ? await exportTripGpx(trip!.id) : await exportTripKmz(trip!.id)
    window.open(tripExportUrl(item.download_url), '_blank', 'noopener,noreferrer')
  }

  return <aside className={`map-sidebar trip-planner-panel${tripViewOnly ? ' trip-planner-panel--trip-view' : ''}`} aria-label="Préparation de sortie">
    <header className="trip-panel-header"><div><p className="cv-workspace-panel__eyebrow">Sortie</p><h2>Préparation</h2></div><div className="trip-panel-header-actions"><button className={`panel-icon-button trip-view-button${tripViewOnly ? ' active' : ''}`} type="button" aria-label={tripViewOnly ? 'Quitter la vue du voyage' : 'Activer la vue du voyage'} aria-pressed={tripViewOnly} title={tripViewOnly ? 'Afficher la préparation complète' : 'Afficher uniquement le voyage'} onClick={() => onTripViewOnlyChange(!tripViewOnly)}><Route size={16} /></button><button className="panel-icon-button" type="button" aria-label="Fermer le panneau Sortie" onClick={onClose}><X size={17} /></button></div></header>
    {tripViewOnly ? <div className="trip-panel-compact-summary">{summary ? <TripSummaryMetrics summary={summary} defaultOpen /> : <div className="trip-panel-empty" role="status"><Route size={24} /><strong>Chargement du résumé…</strong></div>}</div> : <>
    {error && <p className="trip-panel-error" role="alert">{error === 'Internal Server Error' ? 'Une erreur serveur empêche cette opération.' : error}</p>}
    <div className="trip-panel-selector"><select aria-label="Voyage actif" value={loadingTripId ?? trip?.id ?? ''} onChange={(event) => void selectTrip(event.target.value)}><option value="">Choisir un voyage</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{canEdit && <button className="panel-icon-button primary" type="button" aria-label="Créer une sortie" onClick={() => setCreateOpen(true)}><Plus size={16} /></button>}</div>
    {loadingTripId ? <div className="trip-panel-empty" role="status"><Route size={28} /><strong>Chargement du voyage…</strong></div> : <>{summary && <TripSummaryMetrics summary={summary} />}
    {!trip ? <div className="trip-panel-empty"><Route size={28} /><strong>Aucune sortie préparée</strong><span>Créez un voyage puis ajoutez les POI depuis le panneau Lieux.</span></div> : <>
      <TripSettings trip={trip} canEdit={canEdit} canDelete={poiMap.can_delete === true} busy={busy} draftName={draftName} dirty={dirty} loadSettings={loadSettingsDraft ?? readLoadSettings(trip)} routingProviderLabel={summary?.route_provider_labels?.join(', ') || (preferredRoutingProvider === 'google' ? 'Google Routes' : 'OSRM')} countryConstraintName={summary?.country_constraint_enabled ? summary.constraint_country_name ?? poiMap.country.name : null} onNameChange={(value) => { setDraftName(value); setDirty(value !== trip.name) }} onLoadSettingsChange={setLoadSettingsDraft} onSave={() => void run(async () => { if (draftName !== trip.name) await updateTrip(trip.id, { name: draftName }); if (loadSettingsDraft) await updateTripLoadSettings(trip.id, loadSettingsDraft); await reload(trip.id) })} onDuplicate={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })} onDelete={() => { if (window.confirm('Supprimer définitivement ce voyage ?')) void run(async () => { await deleteTrip(trip.id); await reload('') }) }} onGoogle={() => void run(async () => { const result = await exportTripGoogleMaps(trip.id); result.links.forEach((link) => window.open(link.url, '_blank', 'noopener,noreferrer')) })} onGpx={() => void run(() => exportFile('gpx'))} onKmz={() => void run(() => exportFile('kmz'))} />
      <details className="trip-panel-section trip-panel-journeys" open><summary><span>Trajets</span><small>{trip.days.length} {trip.days.length > 1 ? 'journées' : 'journée'}</small><ChevronDown className="trip-panel-chevron" size={15} /></summary>
        <div className="trip-panel-days">{trip.days.map((day, dayIndex) => <div key={day.id} style={{ '--trip-day-color': day.color ?? '#0FA68A' } as CSSProperties}>
          {dayIndex === 0 && <Departure trip={trip} canEdit={canEdit} run={run} reload={reload} />}
          {dayIndex > 0 && <Night previous={trip.days[dayIndex - 1]} next={day} trip={trip} canEdit={canEdit} run={run} reload={reload} />}
          <details className="trip-panel-day" open={day.id === activeDayId} onToggle={(event) => { if (event.currentTarget.open) onActiveDayChange(day.id) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day)}>
            <summary><span>{day.day_number}</span><span><strong>{day.title || `Jour ${day.day_number}`}</strong><small>{day.stops.length} étapes · Route : {formatRouteDistance(daySummaries[day.id]?.route_distance_meters ?? null)} · Conduite : {formatMinutes(daySummaries[day.id]?.route_duration_minutes ?? null)} · Total : {formatMinutes(daySummaries[day.id]?.total_duration_minutes ?? null)}</small>{daySummaries[day.id] && <LoadBadge summary={daySummaries[day.id]} />}</span><span className="trip-panel-day-actions"><DayVisibilityToggle day={day} hidden={hiddenDayIds.has(day.id)} onChange={(visible) => onDayVisibilityChange(day.id, visible)} />{canEdit && <><button type="button" aria-label="Monter la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, -1) }}><ArrowUp size={12} /></button><button type="button" aria-label="Descendre la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, 1) }}><ArrowDown size={12} /></button><button type="button" aria-label="Dupliquer la journée" onClick={(event) => { event.preventDefault(); void run(async () => { await duplicateTripDay(day.id); await reload(trip.id) }) }}><Copy size={12} /></button><button type="button" aria-label="Supprimer la journée" onClick={(event) => { event.preventDefault(); if (window.confirm('Supprimer cette journée ?')) void run(async () => { await deleteTripDay(day.id); await reload(trip.id) }) }}><Trash2 size={12} /></button></>}</span></summary>
            <div className="trip-panel-day-content">{day.route_status === 'stale' && <p>Itinéraire à recalculer</p>}{daySummaries[day.id]?.country_constraint_status === 'unchecked' && <p className="trip-metrics-warning">Itinéraire à vérifier avec la contrainte pays.</p>}{daySummaries[day.id]?.country_constraint_status === 'invalid' && <p className="trip-panel-error">Itinéraire refusé : passage hors de {daySummaries[day.id]?.constraint_country_name}.</p>}<DayTimeSummary day={day} summary={daySummaries[day.id]} /><DayTimingSettings day={day} summary={daySummaries[day.id]} canEdit={canEdit} busy={busy} endsAtHotel={trip.nights.some((night) => night.previous_day_id === day.id)} onSave={async (payload) => { await updateTripDayTiming(day.id, payload); await reload(trip.id) }} />
              <DayColorPicker day={day} disabled={!canEdit || busy} onChange={(color) => void run(async () => { await updateTripDay(day.id, { color }); await reload(trip.id) })} />
              <ul>{day.stops.map((stop, index) => <li key={stop.id} className={`${draggedStopId === stop.id ? 'is-dragging' : ''}${dropTarget?.dayId === day.id && dropTarget.index === index ? ' drop-before' : ''}${index === day.stops.length - 1 && dropTarget?.dayId === day.id && dropTarget.index === day.stops.length ? ' drop-after' : ''}`} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `stop:${stop.id}`); setDraggedStopId(stop.id) }} onDragEnd={() => { setDraggedStopId(null); setDropTarget(null) }} onDragOver={(event) => { if (!canEdit) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ dayId: day.id, index: index + Number(event.clientY > bounds.top + bounds.height / 2) }) }} onDrop={(event) => dropStop(event, day, dropTarget?.dayId === day.id ? dropTarget.index : index)}><GripVertical size={13} /><i>{index + 1}</i><span role="button" tabIndex={0} onClick={() => onStopFocus?.(stop.latitude, stop.longitude)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onStopFocus?.(stop.latitude, stop.longitude) } }}><strong>{stop.name}</strong></span>{canEdit && <VisitDurationControl stop={stop} disabled={busy} onChange={async (minutes) => { await updateTripStop(stop.id, { visit_duration_minutes: minutes }); await reload(trip.id) }} />}{stop.is_locked && <Lock size={11} />}{canEdit && <span className="trip-panel-stop-actions"><button type="button" aria-label="Monter l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, -1) }}><ArrowUp size={11} /></button><button type="button" aria-label="Descendre l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, 1) }}><ArrowDown size={11} /></button><button type="button" aria-label="Supprimer l’étape" onClick={(event) => { event.stopPropagation(); void run(async () => { await deleteTripStop(stop.id); await reload(trip.id) }) }}><Trash2 size={11} /></button></span>}</li>)}</ul>
              {day.stops.length === 0 && <p className="trip-panel-drop">Glissez des POI depuis le panneau Lieux</p>}{canEdit && <FreeStop day={day} poiMap={poiMap} reload={() => reload(trip.id)} />}<div className="trip-panel-route-actions"><button className={routeFeedback === day.id ? 'route-success' : undefined} type="button" disabled={!canCalculateRoute(trip, day, dayIndex)} onClick={() => recalculateRoute(day)}>{routeFeedback === day.id ? <><Check size={13} />Itinéraire rafraîchi</> : <><Route size={13} />Itinéraire</>}</button><button type="button" disabled={day.stops.length < 2} onClick={() => void run(async () => setOptimization({ dayId: day.id, value: await optimizeTripDay(day.id) }))}><Navigation size={13} />Optimiser</button></div>{optimization?.dayId === day.id && <div className="trip-panel-optimization"><OptimizationMetrics value={optimization.value} /><button type="button" onClick={() => setOptimization(null)}>Refuser</button><button type="button" onClick={() => void run(async () => { await confirmTripOptimization(day.id, optimization.value.optimized_stop_ids); setOptimization(null); await reload(trip.id) })}><Check size={11} />Accepter</button></div>}</div>
          </details>
          {dayIndex === trip.days.length - 1 && <>{canEdit && <button className="trip-panel-add-day-ghost" type="button" aria-label="Ajouter une journée" title="Ajouter une journée" onClick={() => void run(async () => { await addTripDay(trip.id); await reload(trip.id) })}><span className="trip-panel-add-day-ghost__plus"><Plus size={15} aria-hidden="true" /></span></button>}<Arrival trip={trip} canEdit={canEdit} run={run} reload={reload} /></>}
        </div>)}</div>
      </details>
    </>}</>}</>}
    {createOpen && <CreateTripDialog mapName={poiMap.name} onClose={() => setCreateOpen(false)} onCreate={async (payload) => { const created = await createTrip(poiMap.id, payload); await reload(created.id); setCreateOpen(false) }} />}
  </aside>
}

function TripSettings({ trip, canEdit, canDelete, busy, draftName, dirty, loadSettings, routingProviderLabel, countryConstraintName, onNameChange, onLoadSettingsChange, onSave, onDuplicate, onDelete, onGoogle, onGpx, onKmz }: { trip: Trip; canEdit: boolean; canDelete: boolean; busy: boolean; draftName: string; dirty: boolean; loadSettings: TripLoadSettings; routingProviderLabel: string; countryConstraintName: string | null; onNameChange: (value: string) => void; onLoadSettingsChange: (settings: TripLoadSettings) => void; onSave: () => void; onDuplicate: () => void; onDelete: () => void; onGoogle: () => void; onGpx: () => void; onKmz: () => void }) {
  return <details className="trip-panel-section trip-panel-settings"><summary><span>Paramètres du voyage</span><ChevronDown className="trip-panel-chevron" size={15} /></summary><section className="trip-panel-options"><h3>Nom du voyage</h3><div className="trip-panel-fields"><input aria-label="Nom du voyage" value={draftName} readOnly={!canEdit} onChange={(event) => onNameChange(event.target.value)} /><div className="trip-panel-field-meta"><span className={dirty ? 'dirty' : ''}>{dirty ? 'Non enregistré' : 'Enregistré'}</span><span className="trip-panel-inline-actions"><TripExports onGoogle={onGoogle} onGpx={onGpx} onKmz={onKmz} /><button type="button" aria-label="Dupliquer le voyage" onClick={onDuplicate}><Copy size={13} /></button>{canDelete && <button type="button" aria-label="Supprimer le voyage" onClick={onDelete}><Trash2 size={13} /></button>}</span></div></div></section><section className="trip-panel-routing-settings" aria-label="Paramètres de routage"><h3>Routage</h3><p><strong>Moteur</strong><span>{routingProviderLabel}</span></p>{countryConstraintName && <p><strong>Contrainte</strong><span>Itinéraire limité à la {countryConstraintName}</span></p>}</section><TripLoadSettingsForm trip={trip} canEdit={canEdit} busy={busy} value={loadSettings} onChange={onLoadSettingsChange} embedded />{canEdit && <div className="trip-panel-settings-actions"><button className="primary" type="button" disabled={busy || loadSettings.low_load_max_minutes >= loadSettings.medium_load_max_minutes} onClick={onSave}><Save size={13} />Enregistrer</button></div>}</details>
}

function TripSummaryMetrics({ summary, defaultOpen = false }: { summary: TripSummary; defaultOpen?: boolean }) {
  return <details className="trip-metrics trip-metrics-global" open={defaultOpen}><summary><span id="trip-route-summary-title">Résumé du voyage</span><small>{formatRouteDistance(summary.total_route_distance_meters)} · {formatMinutes(summary.total_planned_duration_minutes)}</small><ChevronDown className="trip-panel-chevron" size={15} /></summary><div className="trip-metrics__body" aria-labelledby="trip-route-summary-title"><div className="trip-metrics-group"><strong>Trajet total</strong><dl><Metric label="Distance totale de route" value={formatRouteDistance(summary.total_route_distance_meters)} /><Metric label="Temps total de conduite" value={formatMinutes(summary.total_route_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Durée planifiée</strong><dl><Metric label="Visites" value={formatMinutes(summary.total_visit_duration_minutes)} /><Metric label="Temps tampon" value={formatMinutes(summary.total_buffer_duration_minutes)} /><Metric label="Marges de sécurité" value={formatMinutes(summary.total_safety_margin_minutes)} /><Metric label="Durée totale estimée" value={formatMinutes(summary.total_planned_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Charge des journées</strong><dl><Metric label="Légères" value={String(summary.low_load_days)} /><Metric label="Moyennes" value={String(summary.medium_load_days)} /><Metric label="Élevées" value={String(summary.high_load_days)} /></dl></div>{!summary.is_time_summary_complete && <p className="trip-metrics-warning" role="status">Résumé partiel : {summary.days_with_incomplete_time_summary} {summary.days_with_incomplete_time_summary > 1 ? 'journées sans planification complète' : 'journée sans planification complète'}.</p>}</div></details>
}

function OptimizationMetrics({ value }: { value: TripOptimization }) { return <div className="trip-optimization-comparison" aria-label="Comparaison de l’optimisation"><div><strong>Avant</strong><span>Distance : {formatRouteDistance(value.before_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.before_duration_seconds)}</span></div><div><strong>Après</strong><span>Distance : {formatRouteDistance(value.after_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.after_duration_seconds)}</span></div><div><strong>Gain</strong><span>Distance : {formatRouteDistance(value.distance_gain_meters)}</span><span>Conduite : {formatRouteDuration(value.duration_gain_seconds)}</span></div></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd aria-label={`${label} : ${value}`}>{value}</dd></div> }
function TripExports({ onGoogle, onGpx, onKmz }: { onGoogle: () => void; onGpx: () => void; onKmz: () => void }) { return <details className="trip-panel-exports"><summary aria-label="Télécharger"><Download size={13} /></summary><div><button type="button" onClick={onGoogle}>Google Maps</button><button type="button" onClick={onGpx}>GPX</button><button type="button" onClick={onKmz}>KMZ</button></div></details> }

function DayColorPicker({ day, disabled, onChange }: { day: TripDay; disabled: boolean; onChange: (color: string) => void }) {
  return <label className="trip-day-color-picker"><span>Couleur du jour</span><input aria-label={`Couleur du jour ${day.day_number}`} type="color" value={day.color ?? '#0FA68A'} disabled={disabled} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>
}

function DayVisibilityToggle({ day, hidden, onChange }: { day: TripDay; hidden: boolean; onChange: (visible: boolean) => void }) {
  const hasMapContent = day.stops.length > 0 || Boolean(day.route_geometry?.coordinates.length)
  const visible = hasMapContent && !hidden
  const label = !hasMapContent ? `Jour ${day.day_number} sans contenu cartographique` : `${hidden ? 'Afficher' : 'Masquer'} le jour ${day.day_number} sur la carte`
  return <button className="trip-day-visibility-toggle" type="button" role="switch" aria-checked={visible} aria-label={label} title={label} disabled={!hasMapContent} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(hidden) }}>{visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
}

function FreeStop({ day, poiMap, reload }: { day: TripDay; poiMap: PoiMap; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const anchor = day.stops.at(-1)
  return <><button className="trip-panel-free-stop" type="button" onClick={() => setOpen(true)}><GripVertical size={13} /><i>+</i><span><strong>Lieu libre</strong><small>Ajouter une adresse ou des coordonnées</small></span><Plus size={13} /></button>{open && <CreateTripNightDialog kind="stop" mapName={poiMap.name} countryCode={poiMap.country.iso_alpha2} focus={[anchor?.latitude ?? poiMap.effective_center_latitude, anchor?.longitude ?? poiMap.effective_center_longitude]} onClose={() => setOpen(false)} onCreate={async (payload) => { await addTripStop(day.id, { ...payload }); await reload(); setOpen(false) }} />}</>
}

function Departure({ trip, canEdit, run, reload }: { trip: Trip; canEdit: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: (id?: string) => Promise<void> }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = trip.days[0]?.stops[0]
  const drop = (event: DragEvent) => { event.preventDefault(); if (trip.departure || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  return <><div className={`trip-panel-night trip-panel-departure${!trip.departure && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!trip.departure && canEdit) event.preventDefault() }} onDrop={drop}><MapPin size={14} /><span><strong>Départ</strong><small>{trip.departure?.name ?? 'Glissez un POI ou ajoutez un point de départ'}</small></span>{canEdit && (trip.departure ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier le point de départ" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button><button type="button" aria-label="Supprimer le point de départ" onClick={() => void run(async () => { await deleteTripDeparture(trip.departure!.id); await reload(trip.id) })}><Trash2 size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Ajouter</button>)}</div>{dialog && <CreateTripNightDialog kind="departure" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? trip.departure?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && trip.departure && !trip.departure.place_id ? trip.departure : undefined} initialNotes={dialog.edit ? trip.departure?.notes : undefined} initialDepartureTime={dialog.edit ? trip.departure?.departure_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && trip.departure) await updateTripDeparture(trip.departure.id, payload); else await addTripDeparture(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function Arrival({ trip, canEdit, run, reload }: { trip: Trip; canEdit: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: (id?: string) => Promise<void> }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = trip.days.at(-1)?.stops.at(-1) ?? trip.departure
  const drop = (event: DragEvent) => { event.preventDefault(); if (trip.arrival || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  const fallback = trip.departure?.name ?? 'Même point que le départ'
  return <><div className={`trip-panel-night trip-panel-arrival${!trip.arrival && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!trip.arrival && canEdit) event.preventDefault() }} onDrop={drop}><Flag size={14} /><span><strong>Arrivée</strong><small>{trip.arrival?.name ?? fallback}</small></span>{canEdit && (trip.arrival ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier le point d’arrivée" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button><button type="button" aria-label="Utiliser le point de départ comme arrivée" onClick={() => void run(async () => { await deleteTripArrival(trip.arrival!.id); await reload(trip.id) })}><Trash2 size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Personnaliser</button>)}</div>{dialog && <CreateTripNightDialog kind="arrival" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? trip.arrival?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && trip.arrival && !trip.arrival.place_id ? trip.arrival : undefined} initialNotes={dialog.edit ? trip.arrival?.notes : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && trip.arrival) await updateTripArrival(trip.arrival.id, payload); else await addTripArrival(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function Night({ trip, previous, next, canEdit, run, reload }: { trip: Trip; previous: TripDay; next: TripDay; canEdit: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: (id?: string) => Promise<void> }) {
  const night = trip.nights.find((item) => item.previous_day_id === previous.id && item.next_day_id === next.id); const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = previous.stops.at(-1) ?? next.stops[0]
  const drop = (event: DragEvent) => { event.preventDefault(); if (night || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  return <><div className={`trip-panel-night${!night && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!night && canEdit) event.preventDefault() }} onDrop={drop}><BedDouble size={14} /><span><strong>Nuit {previous.day_number}</strong><small>{night?.name ?? 'Glissez un POI ou ajoutez un hébergement'}</small></span>{canEdit && (night ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier l’hébergement" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button><button type="button" aria-label="Supprimer l’hébergement" onClick={() => void run(async () => { await deleteTripNight(night.id); await reload(trip.id) })}><Trash2 size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Ajouter</button>)}</div>{dialog && <CreateTripNightDialog previousDayId={previous.id} nextDayId={next.id} mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? night?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && night && !night.place_id ? night : undefined} initialNotes={dialog.edit ? night?.notes : undefined} initialCheckInTime={dialog.edit ? night?.check_in_time : undefined} initialCheckOutTime={dialog.edit ? night?.check_out_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && night) await updateTripNight(night.id, payload); else await addTripNight(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function canCalculateRoute(trip: Trip, day: TripDay, dayIndex: number) { const hasStart = dayIndex === 0 ? trip.departure !== null : trip.nights.some((night) => night.next_day_id === day.id); const hasEnd = trip.nights.some((night) => night.previous_day_id === day.id) || dayIndex === trip.days.length - 1 && (trip.arrival ?? trip.departure) !== null; return day.stops.length + Number(hasStart) + Number(hasEnd) >= 2 }
function readLoadSettings(trip: Trip): TripLoadSettings { return { low_load_max_minutes: trip.low_load_max_minutes, medium_load_max_minutes: trip.medium_load_max_minutes, low_load_color: trip.low_load_color, medium_load_color: trip.medium_load_color, high_load_color: trip.high_load_color } }
