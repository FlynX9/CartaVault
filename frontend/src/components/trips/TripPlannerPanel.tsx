import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, BedDouble, Car, Check, ChevronDown, Clock3, Copy, Download, Eye, EyeOff, Flag, GripVertical, Lock, MapPin, Moon, Navigation, Pencil, Plus, Route, Save, SlidersHorizontal, Sun, Trash2, X } from 'lucide-react'

import { addTripArrival, addTripDay, addTripDeparture, addTripNight, addTripStop, calculateTripDayRoute, confirmTripOptimization, createTrip, deleteTrip, deleteTripDay, deleteTripStop, duplicateTrip, duplicateTripDay, exportTripGpx, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTripDay, reorderTripDays, reorderTripStops, tripExportUrl, updateTrip, updateTripArrival, updateTripDay, updateTripDayTiming, updateTripDeparture, updateTripLoadSettings, updateTripNight, updateTripStop } from '../../api/trips'
import { getAccountPreferences } from '../../api/account'
import type { PoiMap } from '../../types/map'
import type { Trip, TripDay, TripDayTimeSummary, TripDayTimingPayload, TripLoadSettings, TripOptimization, TripSummary } from '../../types/trip'
import { CreateTripDialog } from './CreateTripDialog'
import { CreateTripNightDialog } from './CreateTripNightDialog'
import { formatClock, formatMinutes, formatRouteDistance, formatRouteDuration } from './tripMetrics'
import { DayTimingSettings, TripLoadSettingsForm, VisitDurationControl } from './TripTimePlanning'

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
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  const insertDayAfter = (day: TripDay) => {
    if (!trip) return
    void run(async () => { await addTripDay(trip.id, { after_day_id: day.id }); await reload(trip.id) })
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
  const exportGpx = async () => {
    const item = await exportTripGpx(trip!.id)
    window.open(tripExportUrl(item.download_url), '_blank', 'noopener,noreferrer')
  }

  return <aside className={`map-sidebar trip-planner-panel${tripViewOnly ? ' trip-planner-panel--trip-view' : ''}`} aria-label="Préparation de sortie">
    <header className="trip-panel-header cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">Sortie</p><h2 className="cv-workspace-panel__title" title={trip?.name ?? 'Préparation'}>{trip?.name ?? 'Préparation'}</h2></div><div className="trip-panel-header-actions cv-workspace-panel__header-actions"><button className={`panel-icon-button trip-view-button${tripViewOnly ? ' active' : ''}`} type="button" aria-label={tripViewOnly ? 'Quitter la vue du voyage' : 'Activer la vue du voyage'} aria-pressed={tripViewOnly} title={tripViewOnly ? 'Afficher la préparation complète' : 'Afficher uniquement le voyage'} onClick={() => onTripViewOnlyChange(!tripViewOnly)}><Route size={16} /></button><button className="panel-icon-button" type="button" aria-label="Fermer le panneau Sortie" onClick={onClose}><X size={17} /></button></div></header>
    {tripViewOnly ? <div className="trip-panel-compact-summary">{summary ? <TripSummaryMetrics summary={summary} defaultOpen /> : <div className="trip-panel-empty" role="status"><Route size={24} /><strong>Chargement du résumé…</strong></div>}</div> : <>
    {error && <p className="trip-panel-error" role="alert">{error === 'Internal Server Error' ? 'Une erreur serveur empêche cette opération.' : error}</p>}
    <div className="trip-panel-selector"><select aria-label="Voyage actif" value={loadingTripId ?? trip?.id ?? ''} onChange={(event) => void selectTrip(event.target.value)}><option value="">Choisir un voyage</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{canEdit && <button className="panel-icon-button primary" type="button" aria-label="Créer une sortie" title="Ajouter une sortie" onClick={() => setCreateOpen(true)}><Plus size={16} /></button>}{trip && canEdit && <button className="panel-icon-button" type="button" aria-label="Dupliquer cette sortie" title="Dupliquer la sortie" onClick={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })}><Copy size={16} /></button>}{trip && <button className={`panel-icon-button trip-settings-button${settingsOpen ? ' active' : ''}`} type="button" aria-label={settingsOpen ? 'Masquer les paramètres du voyage' : 'Afficher les paramètres du voyage'} aria-expanded={settingsOpen} aria-pressed={settingsOpen} title="Paramètres du voyage" onClick={() => setSettingsOpen((current) => !current)}><SlidersHorizontal size={16} /></button>}{trip && <TripExportMenu onGpx={() => void run(exportGpx)} />}</div>
    {loadingTripId ? <div className="trip-panel-empty" role="status"><Route size={28} /><strong>Chargement du voyage…</strong></div> : <>
    {!trip ? <div className="trip-panel-empty"><Route size={28} /><strong>Aucune sortie préparée</strong><span>Créez un voyage puis ajoutez les POI depuis le panneau Lieux.</span></div> : <>
      {settingsOpen && <TripSettings trip={trip} canEdit={canEdit} canDelete={poiMap.can_delete === true} busy={busy} draftName={draftName} dirty={dirty} loadSettings={loadSettingsDraft ?? readLoadSettings(trip)} routingProviderLabel={summary?.route_provider_labels?.join(', ') || (preferredRoutingProvider === 'google' ? 'Google Routes' : 'OSRM')} countryConstraintName={summary?.country_constraint_enabled ? summary.constraint_country_name ?? poiMap.country.name : null} onNameChange={(value) => { setDraftName(value); setDirty(value !== trip.name) }} onLoadSettingsChange={setLoadSettingsDraft} onSave={() => void run(async () => { if (draftName !== trip.name) await updateTrip(trip.id, { name: draftName }); if (loadSettingsDraft) await updateTripLoadSettings(trip.id, loadSettingsDraft); await reload(trip.id) })} onDuplicate={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })} onDelete={() => { if (window.confirm('Supprimer définitivement ce voyage ?')) void run(async () => { await deleteTrip(trip.id); await reload('') }) }} />}
      {summary && <TripSummaryMetrics summary={summary} />}
      <details className="trip-panel-section trip-panel-journeys" open><summary><span>Trajets</span><small>{trip.days.length} {trip.days.length > 1 ? 'journées' : 'journée'}</small><ChevronDown className="trip-panel-chevron" size={15} /></summary>
        <div className="trip-panel-days">{trip.days.map((day, dayIndex) => <div key={day.id} style={{ '--trip-day-color': day.color ?? '#0FA68A' } as CSSProperties}>
          {dayIndex === 0 && <Departure trip={trip} recommendedStart={daySummaries[day.id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[day.id]?.recommended_start_day_offset ?? null} canEdit={canEdit} reload={reload} />}
          {dayIndex > 0 && <Night previous={trip.days[dayIndex - 1]} next={day} recommendedStart={daySummaries[day.id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[day.id]?.recommended_start_day_offset ?? null} trip={trip} canEdit={canEdit} reload={reload} />}
          <details className={`trip-panel-day${day.id === activeDayId ? ' is-active' : ''}`} open onToggle={(event) => { if (event.currentTarget.open) onActiveDayChange(day.id) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day)}>
            <summary><span className="trip-panel-day-number"><Sun aria-hidden="true" size={12} /><b>J{day.day_number}</b></span><span className="trip-panel-day-heading"><strong>{day.title || `Jour ${day.day_number}`}</strong><small>{day.stops.length} {day.stops.length > 1 ? 'étapes' : 'étape'}</small></span><DayHeaderMetrics summary={daySummaries[day.id]} /><span className="trip-panel-day-actions"><DayVisibilityToggle day={day} hidden={hiddenDayIds.has(day.id)} onChange={(visible) => onDayVisibilityChange(day.id, visible)} />{canEdit && <><button type="button" aria-label="Monter la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, -1) }}><ArrowUp size={12} /></button><button type="button" aria-label="Descendre la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, 1) }}><ArrowDown size={12} /></button><button type="button" aria-label="Dupliquer la journée" onClick={(event) => { event.preventDefault(); void run(async () => { await duplicateTripDay(day.id); await reload(trip.id) }) }}><Copy size={12} /></button><button type="button" aria-label="Supprimer la journée" onClick={(event) => { event.preventDefault(); if (window.confirm('Supprimer cette journée ?')) void run(async () => { await deleteTripDay(day.id); await reload(trip.id) }) }}><Trash2 size={12} /></button></>}</span></summary>
            <div className="trip-panel-day-content">{day.route_status === 'stale' && <p>Itinéraire à recalculer</p>}{daySummaries[day.id]?.country_constraint_status === 'unchecked' && <p className="trip-metrics-warning">Itinéraire à vérifier avec la contrainte pays.</p>}{daySummaries[day.id]?.country_constraint_status === 'invalid' && <p className="trip-panel-error">Itinéraire refusé : passage hors de {daySummaries[day.id]?.constraint_country_name}.</p>}
              <ul>{day.stops.map((stop, index) => <li key={stop.id} className={`${draggedStopId === stop.id ? 'is-dragging' : ''}${dropTarget?.dayId === day.id && dropTarget.index === index ? ' drop-before' : ''}${index === day.stops.length - 1 && dropTarget?.dayId === day.id && dropTarget.index === day.stops.length ? ' drop-after' : ''}`} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `stop:${stop.id}`); setDraggedStopId(stop.id) }} onDragEnd={() => { setDraggedStopId(null); setDropTarget(null) }} onDragOver={(event) => { if (!canEdit) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ dayId: day.id, index: index + Number(event.clientY > bounds.top + bounds.height / 2) }) }} onDrop={(event) => dropStop(event, day, dropTarget?.dayId === day.id ? dropTarget.index : index)}><GripVertical className="trip-stop-grip" size={13} /><i>{index + 1}</i><MapPin className="trip-stop-kind" aria-hidden="true" size={14} /><span role="button" tabIndex={0} onClick={() => onStopFocus?.(stop.latitude, stop.longitude)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onStopFocus?.(stop.latitude, stop.longitude) } }}><strong>{stop.name}</strong>{stop.stop_type !== 'place' && <small>{stopTypeLabel(stop.stop_type)}</small>}</span><span className="trip-stop-duration"><Clock3 aria-hidden="true" size={12} />{formatMinutes(stop.visit_duration_minutes)}</span><span className="trip-stop-drive"><Car aria-hidden="true" size={12} />{formatRouteDuration(day.route_segments?.[index]?.duration_seconds ?? null)}</span>{canEdit && <VisitDurationControl stop={stop} disabled={busy} onChange={async (minutes) => { await updateTripStop(stop.id, { visit_duration_minutes: minutes }); await reload(trip.id) }} />}{stop.is_locked && <Lock size={11} />}{canEdit && <span className="trip-panel-stop-actions"><button type="button" aria-label="Monter l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, -1) }}><ArrowUp size={11} /></button><button type="button" aria-label="Descendre l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, 1) }}><ArrowDown size={11} /></button><button type="button" aria-label="Supprimer l’étape" onClick={(event) => { event.stopPropagation(); void run(async () => { await deleteTripStop(stop.id); await reload(trip.id) }) }}><Trash2 size={11} /></button></span>}</li>)}</ul>
              {day.stops.length === 0 && <p className="trip-panel-drop">Glissez des POI depuis le panneau Lieux</p>}{canEdit && <FreeStop day={day} poiMap={poiMap} reload={() => reload(trip.id)} />}<div className="trip-panel-route-actions"><button className={routeFeedback === day.id ? 'route-success' : undefined} type="button" disabled={!canCalculateRoute(trip, day, dayIndex)} onClick={() => recalculateRoute(day)}>{routeFeedback === day.id ? <><Check size={13} />Itinéraire rafraîchi</> : <><Route size={13} />Itinéraire</>}</button><button type="button" disabled={day.stops.length < 2} onClick={() => void run(async () => setOptimization({ dayId: day.id, value: await optimizeTripDay(day.id) }))}><Navigation size={13} />Optimiser</button></div>{optimization?.dayId === day.id && <div className="trip-panel-optimization"><OptimizationMetrics value={optimization.value} /><button type="button" onClick={() => setOptimization(null)}>Refuser</button><button type="button" onClick={() => void run(async () => { await confirmTripOptimization(day.id, optimization.value.optimized_stop_ids); setOptimization(null); await reload(trip.id) })}><Check size={11} />Accepter</button></div>}<DaySettings day={day} summary={daySummaries[day.id]} canEdit={canEdit} busy={busy} endsAtHotel={trip.nights.some((night) => night.previous_day_id === day.id)} onTimingSave={async (payload) => { await updateTripDayTiming(day.id, payload); await reload(trip.id) }} onColorSave={(color) => void run(async () => { await updateTripDay(day.id, { color }); await reload(trip.id) })} /></div>
          </details>
          {canEdit && <InsertDayControl day={day} onInsert={() => insertDayAfter(day)} />}
          {dayIndex === trip.days.length - 1 && <Arrival trip={trip} canEdit={canEdit} reload={reload} />}
        </div>)}</div>
      </details>
    </>}</>}</>}
    {createOpen && <CreateTripDialog mapName={poiMap.name} onClose={() => setCreateOpen(false)} onCreate={async (payload) => { const created = await createTrip(poiMap.id, payload); await reload(created.id); setCreateOpen(false) }} />}
  </aside>
}

function TripSettings({ trip, canEdit, canDelete, busy, draftName, dirty, loadSettings, routingProviderLabel, countryConstraintName, onNameChange, onLoadSettingsChange, onSave, onDuplicate, onDelete }: { trip: Trip; canEdit: boolean; canDelete: boolean; busy: boolean; draftName: string; dirty: boolean; loadSettings: TripLoadSettings; routingProviderLabel: string; countryConstraintName: string | null; onNameChange: (value: string) => void; onLoadSettingsChange: (settings: TripLoadSettings) => void; onSave: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return <section className="trip-panel-section trip-panel-settings" aria-labelledby="trip-settings-title"><header className="trip-panel-settings__header"><span id="trip-settings-title">Paramètres du voyage</span></header><section className="trip-panel-options"><h3>Nom du voyage</h3><div className="trip-panel-fields"><input aria-label="Nom du voyage" value={draftName} readOnly={!canEdit} onChange={(event) => onNameChange(event.target.value)} /><div className="trip-panel-field-meta"><span className={dirty ? 'dirty' : ''}>{dirty ? 'Non enregistré' : 'Enregistré'}</span><span className="trip-panel-inline-actions"><button type="button" aria-label="Dupliquer le voyage" onClick={onDuplicate}><Copy size={13} /></button>{canDelete && <button type="button" aria-label="Supprimer le voyage" onClick={onDelete}><Trash2 size={13} /></button>}</span></div></div></section><section className="trip-panel-routing-settings" aria-label="Paramètres de routage"><h3>Routage</h3><p><strong>Moteur</strong><span>{routingProviderLabel}</span></p>{countryConstraintName && <p><strong>Contrainte</strong><span>Itinéraire limité à la {countryConstraintName}</span></p>}</section><TripLoadSettingsForm trip={trip} canEdit={canEdit} busy={busy} value={loadSettings} onChange={onLoadSettingsChange} embedded />{canEdit && <div className="trip-panel-settings-actions"><button className="primary" type="button" disabled={busy || loadSettings.low_load_max_minutes >= loadSettings.medium_load_max_minutes} onClick={onSave}><Save size={13} />Enregistrer</button></div>}</section>
}

function TripSummaryMetrics({ summary, defaultOpen = false }: { summary: TripSummary; defaultOpen?: boolean }) {
  return <section className="trip-summary-shell">
    <div className="trip-summary-primary" aria-label="Chiffres clés du voyage">
      <div><Route aria-hidden="true" size={24} /><span><strong>{formatRouteDistance(summary.total_route_distance_meters)}</strong><small>Distance totale</small></span></div>
      <div><Navigation aria-hidden="true" size={24} /><span><strong>{formatMinutes(summary.total_route_duration_minutes)}</strong><small>Temps de trajet</small></span></div>
      <div><Clock3 aria-hidden="true" size={24} /><span><strong>{formatMinutes(summary.total_planned_duration_minutes)}</strong><small>Temps total avec visites</small></span></div>
    </div>
    <details className="trip-metrics trip-metrics-global" open={defaultOpen}>
      <summary><span id="trip-route-summary-title">Résumé du voyage</span><small>Détails</small><ChevronDown className="trip-panel-chevron" size={15} /></summary>
      <div className="trip-metrics__body" aria-labelledby="trip-route-summary-title"><div className="trip-metrics-group"><strong>Trajet total</strong><dl><Metric label="Distance totale de route" value={formatRouteDistance(summary.total_route_distance_meters)} /><Metric label="Temps total de conduite" value={formatMinutes(summary.total_route_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Durée planifiée</strong><dl><Metric label="Visites" value={formatMinutes(summary.total_visit_duration_minutes)} /><Metric label="Temps tampon" value={formatMinutes(summary.total_buffer_duration_minutes)} /><Metric label="Marges de sécurité" value={formatMinutes(summary.total_safety_margin_minutes)} /><Metric label="Durée totale estimée" value={formatMinutes(summary.total_planned_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Charge des journées</strong><dl><Metric label="Légères" value={String(summary.low_load_days)} /><Metric label="Moyennes" value={String(summary.medium_load_days)} /><Metric label="Élevées" value={String(summary.high_load_days)} /></dl></div>{!summary.is_time_summary_complete && <p className="trip-metrics-warning" role="status">Résumé partiel : {summary.days_with_incomplete_time_summary} {summary.days_with_incomplete_time_summary > 1 ? 'journées sans planification complète' : 'journée sans planification complète'}.</p>}</div>
    </details>
  </section>
}

function DayHeaderMetrics({ summary }: { summary: TripDayTimeSummary | undefined }) {
  const loadLabels: Record<TripDayTimeSummary['load_level'], string> = { low: 'Faible', medium: 'Modérée', high: 'Élevée', unavailable: 'Non calculée' }
  const loadStyle = summary?.load_color ? { '--trip-load-color': summary.load_color } as CSSProperties : undefined
  return <span className="trip-day-header-metrics" aria-label="Résumé de la journée">
    <span className="trip-day-load-label" style={loadStyle}>{loadLabels[summary?.load_level ?? 'unavailable']}</span>
    <span>{formatRouteDistance(summary?.route_distance_meters ?? null)}</span>
    <span><Car aria-hidden="true" size={12} />{formatMinutes(summary?.route_duration_minutes ?? null)}</span>
    <span><Clock3 aria-hidden="true" size={12} />{formatMinutes(summary?.total_duration_minutes ?? null)}</span>
  </span>
}

function stopTypeLabel(value: Trip['days'][number]['stops'][number]['stop_type']) {
  return ({ free_location: 'Étape libre', hotel: 'Hôtel', restaurant: 'Restaurant', parking: 'Parking', station: 'Gare', airport: 'Aéroport', other: 'Autre', place: 'Lieu' } as const)[value]
}

function OptimizationMetrics({ value }: { value: TripOptimization }) { return <div className="trip-optimization-comparison" aria-label="Comparaison de l’optimisation"><div><strong>Avant</strong><span>Distance : {formatRouteDistance(value.before_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.before_duration_seconds)}</span></div><div><strong>Après</strong><span>Distance : {formatRouteDistance(value.after_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.after_duration_seconds)}</span></div><div><strong>Gain</strong><span>Distance : {formatRouteDistance(value.distance_gain_meters)}</span><span>Conduite : {formatRouteDuration(value.duration_gain_seconds)}</span></div></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd aria-label={`${label} : ${value}`}>{value}</dd></div> }
function TripExportMenu({ onGpx }: { onGpx: () => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  return <details ref={menuRef} className="trip-export-menu"><summary className="panel-icon-button" aria-label="Exporter la sortie" title="Exporter la sortie"><Download size={16} /></summary><div role="menu" aria-label="Options d’export"><button type="button" role="menuitem" onClick={() => { menuRef.current?.removeAttribute('open'); onGpx() }}><Download size={14} />Exporter en GPX</button></div></details>
}

function InsertDayControl({ day, onInsert }: { day: TripDay; onInsert: () => void }) {
  return <div className="trip-panel-insert-day"><button type="button" aria-label={`Ajouter une journée après le jour ${day.day_number}`} title={`Insérer une journée après le jour ${day.day_number}`} onClick={onInsert}><span aria-hidden="true" /><i><Plus size={14} aria-hidden="true" /></i><span aria-hidden="true" /></button></div>
}

function DayColorPicker({ day, disabled, onSave }: { day: TripDay; disabled: boolean; onSave: (color: string) => void }) {
  const initialColor = day.color ?? '#0FA68A'
  const [draftColor, setDraftColor] = useState(initialColor)

  useEffect(() => setDraftColor(initialColor), [day.id, initialColor])

  const hasChanges = draftColor !== initialColor
  return <section className="trip-day-color-picker"><label htmlFor={`day-color-${day.id}`}>Choisir la couleur du tracé et des étapes</label><input id={`day-color-${day.id}`} aria-label={`Couleur du jour ${day.day_number}`} type="color" value={draftColor} disabled={disabled} onChange={(event) => setDraftColor(event.target.value.toUpperCase())} /><div className="trip-day-color-picker__actions"><button type="button" disabled={disabled || !hasChanges} onClick={() => setDraftColor(initialColor)}>Annuler</button><button className="primary" type="button" disabled={disabled || !hasChanges} onClick={() => onSave(draftColor)}>Appliquer la couleur</button></div></section>
}

function DaySettings({ day, summary, canEdit, busy, endsAtHotel, onTimingSave, onColorSave }: { day: TripDay; summary: TripDayTimeSummary | undefined; canEdit: boolean; busy: boolean; endsAtHotel: boolean; onTimingSave: (payload: TripDayTimingPayload) => Promise<void>; onColorSave: (color: string) => void }) {
  return <details className="trip-day-settings">
    <summary><span>Paramètres du jour</span><ChevronDown className="trip-panel-chevron" size={14} /></summary>
    <div className="trip-day-settings__body">
      <DayTimingSettings day={day} summary={summary} canEdit={canEdit} busy={busy} endsAtHotel={endsAtHotel} onSave={onTimingSave} />
      <section className="trip-day-color-section"><h4>Couleur du jour</h4><DayColorPicker day={day} disabled={!canEdit || busy} onSave={onColorSave} /></section>
    </div>
  </details>
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

function Departure({ trip, recommendedStart, recommendedStartOffset, canEdit, reload }: { trip: Trip; recommendedStart: string | null; recommendedStartOffset: number | null; canEdit: boolean; reload: (id?: string) => Promise<void> }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = trip.days[0]?.stops[0]
  const drop = (event: DragEvent) => { event.preventDefault(); if (trip.departure || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  return <><div className={`trip-panel-night trip-panel-departure${!trip.departure && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!trip.departure && canEdit) event.preventDefault() }} onDrop={drop}><span className="trip-timeline-anchor-badge"><MapPin aria-hidden="true" size={15} /></span><span className="trip-anchor-copy"><strong>Départ</strong><small>{trip.departure?.name ?? 'Glissez un POI ou ajoutez un point de départ'}</small></span><span className="trip-anchor-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}><span>Départ conseillé</span><Clock3 aria-hidden="true" size={12} /><strong>{recommendedLabel}</strong></span>{canEdit && (trip.departure ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier le point de départ" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Ajouter</button>)}</div>{dialog && <CreateTripNightDialog kind="departure" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? trip.departure?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && trip.departure && !trip.departure.place_id ? trip.departure : undefined} initialNotes={dialog.edit ? trip.departure?.notes : undefined} initialDepartureTime={dialog.edit ? trip.departure?.departure_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && trip.departure) await updateTripDeparture(trip.departure.id, payload); else await addTripDeparture(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function Arrival({ trip, canEdit, reload }: { trip: Trip; canEdit: boolean; reload: (id?: string) => Promise<void> }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = trip.days.at(-1)?.stops.at(-1) ?? trip.departure
  const drop = (event: DragEvent) => { event.preventDefault(); if (trip.arrival || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  const fallback = trip.departure?.name ?? 'Même point que le départ'
  return <><div className={`trip-panel-night trip-panel-arrival${!trip.arrival && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!trip.arrival && canEdit) event.preventDefault() }} onDrop={drop}><span className="trip-timeline-anchor-badge trip-timeline-arrival-badge"><Flag aria-hidden="true" size={14} /></span><span className="trip-anchor-copy"><strong>Arrivée</strong><small>{trip.arrival?.name ?? fallback}</small></span>{canEdit && (trip.arrival ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier le point d’arrivée" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Personnaliser</button>)}</div>{dialog && <CreateTripNightDialog kind="arrival" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? trip.arrival?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && trip.arrival && !trip.arrival.place_id ? trip.arrival : undefined} initialNotes={dialog.edit ? trip.arrival?.notes : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && trip.arrival) await updateTripArrival(trip.arrival.id, payload); else await addTripArrival(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function Night({ trip, previous, next, recommendedStart, recommendedStartOffset, canEdit, reload }: { trip: Trip; previous: TripDay; next: TripDay; recommendedStart: string | null; recommendedStartOffset: number | null; canEdit: boolean; reload: (id?: string) => Promise<void> }) {
  const night = trip.nights.find((item) => item.previous_day_id === previous.id && item.next_day_id === next.id); const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null); const anchor = previous.stops.at(-1) ?? next.stops[0]
  const drop = (event: DragEvent) => { event.preventDefault(); if (night || !canEdit) return; const value = event.dataTransfer.getData('text/plain'); if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) }) }
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  const timelineColors = { '--trip-night-previous-color': previous.color ?? '#0FA68A', '--trip-night-next-color': next.color ?? '#0FA68A' } as CSSProperties
  return <><div className={`trip-panel-night${!night && canEdit ? ' drop-enabled' : ''}`} onDragOver={(event) => { if (!night && canEdit) event.preventDefault() }} onDrop={drop}><span className="trip-timeline-night-badge" style={timelineColors}><Moon aria-hidden="true" size={13} /><b>N{previous.day_number}</b></span><BedDouble className="trip-night-kind" aria-hidden="true" size={14} /><span className="trip-anchor-copy"><strong>Nuit {previous.day_number}</strong><small>{night?.name ?? 'Glissez un POI ou ajoutez un hébergement'}</small></span><span className="trip-anchor-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}><span>Départ conseillé</span><Clock3 aria-hidden="true" size={12} /><strong>{recommendedLabel}</strong></span>{canEdit && (night ? <span className="trip-anchor-actions"><button type="button" aria-label="Modifier l’hébergement" onClick={() => setDialog({ edit: true })}><Pencil size={11} /></button></span> : <button type="button" onClick={() => setDialog({})}><Plus size={11} />Ajouter</button>)}</div>{dialog && <CreateTripNightDialog previousDayId={previous.id} nextDayId={next.id} mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? night?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && night && !night.place_id ? night : undefined} initialNotes={dialog.edit ? night?.notes : undefined} initialCheckInTime={dialog.edit ? night?.check_in_time : undefined} initialCheckOutTime={dialog.edit ? night?.check_out_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && night) await updateTripNight(night.id, payload); else await addTripNight(trip.id, payload); await reload(trip.id); setDialog(null) }} />}</>
}

function canCalculateRoute(trip: Trip, day: TripDay, dayIndex: number) { const hasStart = dayIndex === 0 ? trip.departure !== null : trip.nights.some((night) => night.next_day_id === day.id); const hasEnd = trip.nights.some((night) => night.previous_day_id === day.id) || dayIndex === trip.days.length - 1 && (trip.arrival ?? trip.departure) !== null; return day.stops.length + Number(hasStart) + Number(hasEnd) >= 2 }
function readLoadSettings(trip: Trip): TripLoadSettings { return { low_load_max_minutes: trip.low_load_max_minutes, medium_load_max_minutes: trip.medium_load_max_minutes, low_load_color: trip.low_load_color, medium_load_color: trip.medium_load_color, high_load_color: trip.high_load_color } }
