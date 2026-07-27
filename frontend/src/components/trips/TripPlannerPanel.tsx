import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Car, Check, ChevronDown, ChevronsDown, ChevronsUp, Clock3, Copy, Download, Eye, EyeOff, Flag, GripVertical, Lock, MapPin, Minus, Moon, Navigation, Pencil, Plus, Route, Save, SlidersHorizontal, Sparkles, Sun, Trash2 } from 'lucide-react'

import { addTripArrival, addTripDay, addTripDeparture, addTripNight, addTripStop, archiveTrip, calculateTripDayRoute, confirmTripOptimization, createTrip, deleteTrip, deleteTripDay, deleteTripNight, deleteTripStop, duplicateTrip, duplicateTripDay, exportTripGpx, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTripDay, reorderTripDays, reorderTripStops, tripExportUrl, unarchiveTrip, updateTrip, updateTripArrival, updateTripDay, updateTripDayTiming, updateTripDeparture, updateTripLoadSettings, updateTripNight, updateTripStop } from '../../api/trips'
import { getAccountPreferences } from '../../api/account'
import type { PoiMap } from '../../types/map'
import type { Trip, TripDay, TripDayTimeSummary, TripDayTimingPayload, TripLoadSettings, TripNightTarget, TripOptimization, TripSummary } from '../../types/trip'
import { CreateTripDialog } from './CreateTripDialog'
import { CreateTripNightDialog } from './CreateTripNightDialog'
import { formatClock, formatMinutes, formatRouteDistance, formatRouteDuration } from './tripMetrics'
import { DayTimingSettings, TripLoadSettingsForm, VisitDurationControl } from './TripTimePlanning'
import { useConfirmDialog } from '../common/useConfirmDialog'

interface Props { poiMap: PoiMap; trip: Trip | null; activeDayId: string | null; tripViewOnly?: boolean; hiddenDayIds?: ReadonlySet<string>; collapsed?: boolean; createRequest?: number; onCollapsedChange?: (collapsed: boolean) => void; onTripViewOnlyChange?: (enabled: boolean) => void; onDayVisibilityChange?: (dayId: string, visible: boolean) => void; onTripChange: (trip: Trip | null) => void; onActiveDayChange: (id: string | null) => void; onActiveNightTargetChange?: (target: TripNightTarget | null) => void; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect?: (placeId: string) => void; onClose: () => void }

const DayCollapseContext = createContext<{ collapsedDayIds: ReadonlySet<string>; onToggle: (dayId: string) => void } | null>(null)

export function TripPlannerPanel({ poiMap, trip, activeDayId, tripViewOnly = false, hiddenDayIds = new Set<string>(), collapsed = false, createRequest = 0, onCollapsedChange = () => undefined, onTripViewOnlyChange = () => undefined, onDayVisibilityChange = () => undefined, onTripChange, onActiveDayChange, onActiveNightTargetChange = () => undefined, onStopFocus, onStopPlaceSelect = () => undefined }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canEdit = poiMap.can_edit === true
  const isArchivedTrip = trip?.status === 'completed' || trip?.status === 'archived'
  const canEditTrip = canEdit && !isArchivedTrip
  const [trips, setTrips] = useState<Trip[]>([])
  const [optimization, setOptimization] = useState<{ dayId: string; value: TripOptimization } | null>(null)
  const [globalOptimization, setGlobalOptimization] = useState<Array<{ dayId: string; dayNumber: number; value: TripOptimization }> | null>(null)
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
  const [collapsedDayIds, setCollapsedDayIds] = useState<Set<string>>(() => new Set())
  const [timelineCollapseRequest, setTimelineCollapseRequest] = useState({ collapsed: false, version: 0 })
  const [openDaySettingsIds, setOpenDaySettingsIds] = useState<Set<string>>(() => new Set())
  const [activeNightTarget, setActiveNightTarget] = useState<TripNightTarget | null>(null)
  const activeDayIdRef = useRef(activeDayId)
  const onTripChangeRef = useRef(onTripChange)
  const onActiveDayChangeRef = useRef(onActiveDayChange)
  const onActiveNightTargetChangeRef = useRef(onActiveNightTargetChange)
  const loadControllerRef = useRef<AbortController | null>(null)
  const selectionVersionRef = useRef(0)
  onTripChangeRef.current = onTripChange
  onActiveDayChangeRef.current = onActiveDayChange
  onActiveNightTargetChangeRef.current = onActiveNightTargetChange

  useEffect(() => { activeDayIdRef.current = activeDayId }, [activeDayId])
  useEffect(() => {
    if (createRequest > 0 && canEdit) setCreateOpen(true)
  }, [canEdit, createRequest])
  useEffect(() => {
    const dayIds = new Set(trip?.days.map((day) => day.id) ?? [])
    setCollapsedDayIds((current) => new Set([...current].filter((dayId) => dayIds.has(dayId))))
    setOpenDaySettingsIds((current) => new Set([...current].filter((dayId) => dayIds.has(dayId))))
  }, [trip])
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
    setActiveNightTarget(null)
    onActiveNightTargetChangeRef.current(null)
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
    if (!trip || !canEditTrip) return
    void run(async () => { await addTripDay(trip.id, { after_day_id: day.id }); await reload(trip.id) })
  }
  const reorderStops = (day: TripDay, index: number, delta: number) => {
    const ids = day.stops.map((stop) => stop.id); const target = index + delta
    if (target < 0 || target >= ids.length) return
    [ids[index], ids[target]] = [ids[target], ids[index]]
    void run(async () => { await reorderTripStops(day.id, ids); await reload(trip!.id) })
  }
  const drop = (event: DragEvent, day: TripDay) => {
    if (!canEditTrip) return
    event.preventDefault(); const data = event.dataTransfer.getData('text/plain')
    if (data.startsWith('place:')) void run(async () => { await addTripStop(day.id, { place_id: data.slice(6), stop_type: 'place', visit_duration_minutes: 30 }); await reload(trip!.id) })
    if (data.startsWith('stop:')) void run(async () => { await moveTripStop(data.slice(5), day.id, day.stops.length); await reload(trip!.id) })
  }
  const dropStop = (event: DragEvent, day: TripDay, index: number) => {
    if (!canEditTrip) return
    event.preventDefault(); event.stopPropagation(); const data = event.dataTransfer.getData('text/plain')
    setDraggedStopId(null); setDropTarget(null)
    if (data.startsWith('place:')) {
      const placeId = data.slice(6)
      if (!placeId) return
      void run(async () => {
        const created = await addTripStop(day.id, { place_id: placeId, stop_type: 'place', visit_duration_minutes: 30 })
        if (index < day.stops.length) await moveTripStop(created.id, day.id, index)
        await reload(trip!.id)
      })
      return
    }
    if (!data.startsWith('stop:')) return
    const stopId = data.slice(5)
    if (!stopId) return
    void run(async () => { await moveTripStop(stopId, day.id, index); await reload(trip!.id) })
  }
  const recalculateRoute = (day: TripDay) => void run(async () => {
    if (!canEditTrip) return
    await calculateTripDayRoute(day.id); await reload(trip!.id); setRouteFeedback(day.id)
    window.setTimeout(() => setRouteFeedback((current) => current === day.id ? null : current), 1600)
  })
  const recalculateAllRoutes = () => {
    if (!trip || !canEditTrip) return
    const routableDays = trip.days.filter((day, dayIndex) => canCalculateRoute(trip, day, dayIndex))
    if (!routableDays.length) return
    void run(async () => {
      for (const day of routableDays) await calculateTripDayRoute(day.id)
      await reload(trip.id)
      setRouteFeedback('all')
      window.setTimeout(() => setRouteFeedback((current) => current === 'all' ? null : current), 1600)
    })
  }
  const optimizeAllDays = () => {
    if (!trip || !canEditTrip) return
    const optimizableDays = trip.days.filter((day) => day.stops.length >= 2)
    if (!optimizableDays.length) return
    void run(async () => {
      const proposals = await Promise.all(optimizableDays.map(async (day) => ({
        dayId: day.id,
        dayNumber: day.day_number,
        value: await optimizeTripDay(day.id),
      })))
      setGlobalOptimization(proposals)
    })
  }
  const applyGlobalOptimization = () => {
    if (!trip || !globalOptimization || !canEditTrip) return
    void run(async () => {
      for (const proposal of globalOptimization) await confirmTripOptimization(proposal.dayId, proposal.value.optimized_stop_ids)
      setGlobalOptimization(null)
      await reload(trip.id)
    })
  }
  const exportGpx = async () => {
    const item = await exportTripGpx(trip!.id)
    window.open(tripExportUrl(item.download_url), '_blank', 'noopener,noreferrer')
  }
  const toggleDayCollapsed = (dayId: string) => setCollapsedDayIds((current) => {
    const next = new Set(current)
    if (next.has(dayId)) next.delete(dayId)
    else next.add(dayId)
    return next
  })
  const toggleDaySettings = (dayId: string) => setOpenDaySettingsIds((current) => {
    const next = new Set(current)
    if (next.has(dayId)) next.delete(dayId)
    else next.add(dayId)
    return next
  })
  const activateDay = (dayId: string) => { setActiveNightTarget(null); onActiveNightTargetChange(null); onActiveDayChange(dayId) }
  const setAllTimelineCollapsed = (nextCollapsed: boolean) => {
    setCollapsedDayIds(nextCollapsed ? new Set(trip?.days.map((day) => day.id) ?? []) : new Set())
    setTimelineCollapseRequest((current) => ({ collapsed: nextCollapsed, version: current.version + 1 }))
  }

  const tripName = trip?.name ?? 'Préparation'

  return <aside className={`map-sidebar trip-planner-panel${tripViewOnly ? ' trip-planner-panel--trip-view' : ''}${isArchivedTrip ? ' trip-planner-panel--read-only' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="Préparation de sortie">
    {collapsed ? <header className="trip-panel-header trip-panel-header--collapsed cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><h2 className="cv-workspace-panel__title">Sortie</h2><span className="trip-panel-collapsed-name" title={tripName}>{tripName}</span></div><button className="panel-icon-button trip-panel-collapse-toggle" type="button" aria-label="Développer le panneau Sortie" aria-expanded="false" onClick={() => onCollapsedChange(false)}><Plus size={18} /></button></header> : <>
    <header className="trip-panel-header cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow">Sortie</p><div className="trip-panel-title-row"><h2 className="cv-workspace-panel__title" title={tripName}>{tripName}</h2>{trip && <span className={`trip-panel-trip-status trip-panel-trip-status--${trip.status === 'completed' || trip.status === 'archived' ? 'completed' : 'active'}`}>{trip.status === 'completed' || trip.status === 'archived' ? 'Terminée' : 'En cours'}</span>}</div></div><div className="trip-panel-header-actions cv-workspace-panel__header-actions"><button className={`panel-icon-button trip-view-button${tripViewOnly ? ' active' : ''}`} type="button" aria-label={tripViewOnly ? 'Quitter la vue du voyage' : 'Activer la vue du voyage'} aria-pressed={tripViewOnly} title={tripViewOnly ? 'Afficher la préparation complète' : 'Afficher uniquement le voyage'} onClick={() => onTripViewOnlyChange(!tripViewOnly)}><Route size={16} /></button><button className="panel-icon-button trip-panel-collapse-toggle" type="button" aria-label="Réduire le panneau Sortie" aria-expanded="true" onClick={() => onCollapsedChange(true)}><Minus size={17} /></button></div></header>
    {tripViewOnly ? <div className="trip-panel-compact-summary">{summary ? <TripSummaryMetrics summary={summary} defaultOpen /> : <div className="trip-panel-empty" role="status"><Route size={24} /><strong>Chargement du résumé…</strong></div>}</div> : <>
    {error && <p className="trip-panel-error" role="alert">{error === 'Internal Server Error' ? 'Une erreur serveur empêche cette opération.' : error}</p>}
    <div className="trip-panel-selector"><select aria-label="Voyage actif" value={loadingTripId ?? trip?.id ?? ''} onChange={(event) => void selectTrip(event.target.value)}><option value="">Choisir un voyage</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{canEdit && <button className="panel-icon-button primary" type="button" aria-label="Créer une sortie" title="Ajouter une sortie" onClick={() => setCreateOpen(true)}><Plus size={16} /></button>}{trip && canEdit && <button className="panel-icon-button" type="button" aria-label="Dupliquer cette sortie" title="Dupliquer la sortie" onClick={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })}><Copy size={16} /></button>}{trip && canEdit && (isArchivedTrip ? <button className="panel-icon-button trip-unarchive-button" type="button" aria-label="Réactiver la sortie" title="Réactiver la sortie" disabled={busy} onClick={() => void run(async () => { await unarchiveTrip(trip.id); await reload(trip.id) })}><ArchiveRestore size={16} /></button> : <button className="panel-icon-button trip-archive-button" type="button" aria-label="Archiver la sortie" title="Archiver la sortie" disabled={busy} onClick={() => void run(async () => { await archiveTrip(trip.id); await reload(trip.id) })}><Archive size={16} /></button>)}{trip && <button className={`panel-icon-button trip-settings-button${settingsOpen ? ' active' : ''}`} type="button" aria-label={settingsOpen ? 'Masquer les paramètres du voyage' : 'Afficher les paramètres du voyage'} aria-expanded={settingsOpen} aria-pressed={settingsOpen} title="Paramètres du voyage" onClick={() => setSettingsOpen((current) => !current)}><SlidersHorizontal size={16} /></button>}{trip && <TripExportMenu onGpx={() => void run(exportGpx)} />}</div>
    {loadingTripId ? <div className="trip-panel-empty" role="status"><Route size={28} /><strong>Chargement du voyage…</strong></div> : <>
    {!trip ? <div className="trip-panel-empty"><Route size={28} /><strong>Aucune sortie préparée</strong><span>Créez un voyage puis ajoutez les POI depuis le panneau Lieux.</span></div> : <>
      {settingsOpen && <TripSettings trip={trip} canEdit={canEditTrip} canDelete={canEditTrip && poiMap.can_delete === true} busy={busy} draftName={draftName} dirty={dirty} loadSettings={loadSettingsDraft ?? readLoadSettings(trip)} routingProviderLabel={summary?.route_provider_labels?.join(', ') || (preferredRoutingProvider === 'google' ? 'Google Routes' : 'OSRM')} countryConstraintName={summary?.country_constraint_enabled ? summary.constraint_country_name ?? poiMap.country.name : null} onNameChange={(value) => { setDraftName(value); setDirty(value !== trip.name) }} onLoadSettingsChange={setLoadSettingsDraft} onSave={() => void run(async () => { if (draftName !== trip.name) await updateTrip(trip.id, { name: draftName }); if (loadSettingsDraft) await updateTripLoadSettings(trip.id, loadSettingsDraft); await reload(trip.id) })} onDuplicate={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })} onDelete={() => void confirm({ title: 'Placer cette sortie dans la corbeille ?', message: `La sortie « ${trip.name} » et toute sa planification pourront être restaurées pendant votre délai de conservation.` }).then((confirmed) => { if (confirmed) void run(async () => { await deleteTrip(trip.id); await reload('') }) })} />}
      {summary && <TripSummaryMetrics summary={summary} />}
      <section className="trip-panel-section trip-panel-journeys"><header className="trip-panel-journeys-header"><span>Trajets</span><span className="trip-panel-journeys-header-actions">{canEdit && <span className="trip-panel-journeys-route-actions"><button className={routeFeedback === 'all' ? 'route-success' : undefined} type="button" aria-label={routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'} title={routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'} disabled={busy || !trip.days.some((day, dayIndex) => canCalculateRoute(trip, day, dayIndex))} onClick={recalculateAllRoutes}>{routeFeedback === 'all' ? <Check size={13} /> : <Route size={13} />}<span>{routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'}</span></button><button className="trip-global-optimize-button" type="button" aria-label="Optimiser le voyage" title="Optimiser le voyage" disabled={busy || globalOptimization !== null || !trip.days.some((day) => day.stops.length >= 2)} onClick={optimizeAllDays}><Sparkles size={13} /><span>Optimiser le voyage</span></button></span>}<span className="trip-panel-journeys-toggle-actions"><button type="button" aria-label="Tout déplier" title="Tout déplier" onClick={() => setAllTimelineCollapsed(false)}><ChevronsDown size={13} /><span>Tout déplier</span></button><button type="button" aria-label="Tout replier" title="Tout replier" onClick={() => setAllTimelineCollapsed(true)}><ChevronsUp size={13} /><span>Tout replier</span></button></span></span></header>
        {globalOptimization && <GlobalOptimizationReview proposals={globalOptimization} busy={busy} onCancel={() => setGlobalOptimization(null)} onApply={applyGlobalOptimization} />}
        <DayCollapseContext.Provider value={{ collapsedDayIds, onToggle: toggleDayCollapsed }}><div className="trip-panel-days">{trip.days.map((day, dayIndex) => <div key={day.id} style={{ '--trip-day-color': day.color ?? '#0FA68A' } as CSSProperties}>
          {dayIndex === 0 && <Departure trip={trip} recommendedStart={daySummaries[day.id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[day.id]?.recommended_start_day_offset ?? null} canEdit={canEditTrip} reload={reload} collapseRequest={timelineCollapseRequest} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} />}
          {dayIndex > 0 && <Night previous={trip.days[dayIndex - 1]} next={day} recommendedStart={daySummaries[day.id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[day.id]?.recommended_start_day_offset ?? null} trip={trip} activeTarget={activeNightTarget} canEdit={canEditTrip} reload={reload} collapseRequest={timelineCollapseRequest} onSelect={(target) => { setActiveNightTarget(target); onActiveNightTargetChange(target); onActiveDayChange(day.id) }} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} />}
          <details className={`trip-panel-day${day.id === activeDayId && activeNightTarget === null ? ' is-active' : ''}`} open={!collapsedDayIds.has(day.id)} onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('button, input, select, textarea, a')) return; activateDay(day.id); if (target.closest('.trip-panel-day > summary')) event.preventDefault() }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day)}>
            <summary><span className="trip-panel-day-number"><Sun aria-hidden="true" size={12} /><b>J{day.day_number}</b></span><span className="trip-panel-day-heading"><span className="trip-panel-timeline-heading"><strong>{day.title || `Jour ${day.day_number}`}</strong><TimelineStatusBadge status={getDayTimelineStatus(day, daySummaries[day.id])} /></span><small>{day.stops.length} {day.stops.length > 1 ? 'étapes' : 'étape'}</small></span><DayHeaderMetrics summary={daySummaries[day.id]} /><span className="trip-panel-day-actions"><DayVisibilityToggle day={day} hidden={hiddenDayIds.has(day.id)} onChange={(visible) => onDayVisibilityChange(day.id, visible)} />{canEdit && <><button type="button" aria-label="Monter la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, -1) }}><ArrowUp size={12} /></button><button type="button" aria-label="Descendre la journée" onClick={(event) => { event.preventDefault(); reorderDays(dayIndex, 1) }}><ArrowDown size={12} /></button><button type="button" aria-label="Dupliquer la journée" onClick={(event) => { event.preventDefault(); void run(async () => { await duplicateTripDay(day.id); await reload(trip.id) }) }}><Copy size={12} /></button><button type="button" aria-label="Supprimer la journée" onClick={(event) => { event.preventDefault(); void confirm({ title: 'Supprimer cette journée ?', message: `Le jour ${day.day_number}, ses étapes et son itinéraire seront définitivement supprimés.` }).then((confirmed) => { if (confirmed) void run(async () => { await deleteTripDay(day.id); await reload(trip.id) }) }) }}><Trash2 size={12} /></button></>}</span></summary>
            <div className="trip-panel-day-content">{day.route_status === 'stale' && <p>Itinéraire à recalculer</p>}{daySummaries[day.id]?.country_constraint_status === 'unchecked' && <p className="trip-metrics-warning">Itinéraire à vérifier avec la contrainte pays.</p>}{daySummaries[day.id]?.country_constraint_status === 'invalid' && <p className="trip-panel-error">Itinéraire refusé : passage hors de {daySummaries[day.id]?.constraint_country_name}.</p>}
              <ul>{day.stops.map((stop, index) => <li key={stop.id} className={`${draggedStopId === stop.id ? 'is-dragging' : ''}${dropTarget?.dayId === day.id && dropTarget.index === index ? ' drop-before' : ''}${index === day.stops.length - 1 && dropTarget?.dayId === day.id && dropTarget.index === day.stops.length ? ' drop-after' : ''}`} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `stop:${stop.id}`); setDraggedStopId(stop.id) }} onDragEnd={() => { setDraggedStopId(null); setDropTarget(null) }} onDragOver={(event) => { if (!canEdit) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ dayId: day.id, index: index + Number(event.clientY > bounds.top + bounds.height / 2) }) }} onDrop={(event) => dropStop(event, day, dropTarget?.dayId === day.id ? dropTarget.index : index)}><GripVertical className="trip-stop-grip" size={13} /><i>{index + 1}</i><MapPin className="trip-stop-kind" aria-hidden="true" size={14} /><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); activateDay(day.id); onStopFocus?.(stop.latitude, stop.longitude); if (stop.place_id) onStopPlaceSelect(stop.place_id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activateDay(day.id); onStopFocus?.(stop.latitude, stop.longitude); if (stop.place_id) onStopPlaceSelect(stop.place_id) } }}><strong>{stop.name}</strong>{stop.stop_type !== 'place' && <small>{stopTypeLabel(stop.stop_type)}</small>}</span><span className="trip-stop-duration"><Clock3 aria-hidden="true" size={12} />{formatMinutes(stop.visit_duration_minutes)}</span><span className="trip-stop-drive"><Car aria-hidden="true" size={12} />{formatRouteDuration(day.route_segments?.[index]?.duration_seconds ?? null)}</span>{canEdit && <VisitDurationControl stop={stop} disabled={busy} onChange={async (minutes) => { await updateTripStop(stop.id, { visit_duration_minutes: minutes }); await reload(trip.id) }} />}{stop.is_locked && <Lock size={11} />}{canEdit && <span className="trip-panel-stop-actions"><button type="button" aria-label="Monter l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, -1) }}><ArrowUp size={11} /></button><button type="button" aria-label="Descendre l’étape" onClick={(event) => { event.stopPropagation(); reorderStops(day, index, 1) }}><ArrowDown size={11} /></button><button type="button" aria-label="Supprimer l’étape" onClick={(event) => { event.stopPropagation(); void confirm({ title: 'Supprimer cette étape ?', message: `« ${stop.name} » sera retirée de la journée.` }).then((confirmed) => { if (confirmed) void run(async () => { await deleteTripStop(stop.id); await reload(trip.id) }) }) }}><Trash2 size={11} /></button></span>}</li>)}</ul>
              {day.stops.length === 0 && <p className="trip-panel-drop">Glissez des POI depuis le panneau Lieux</p>}{canEdit && <FreeStop day={day} poiMap={poiMap} reload={() => reload(trip.id)} />}<div className="trip-panel-route-actions"><div className="trip-panel-route-actions__main"><button className={routeFeedback === day.id ? 'route-success' : undefined} type="button" disabled={!canCalculateRoute(trip, day, dayIndex)} onClick={() => recalculateRoute(day)}>{routeFeedback === day.id ? <><Check size={13} />Itinéraire rafraîchi</> : <><Route size={13} />Itinéraire</>}</button><button type="button" disabled={day.stops.length < 2} onClick={() => void run(async () => setOptimization({ dayId: day.id, value: await optimizeTripDay(day.id) }))}><Sparkles size={13} />Optimiser</button></div><button className="trip-day-settings-trigger" type="button" aria-expanded={openDaySettingsIds.has(day.id)} aria-controls={`trip-day-settings-${day.id}`} onClick={() => toggleDaySettings(day.id)}><SlidersHorizontal size={13} />Paramètres du jour</button></div>{optimization?.dayId === day.id && <div className="trip-panel-optimization"><OptimizationMetrics value={optimization.value} /><button type="button" onClick={() => setOptimization(null)}>Refuser</button><button type="button" onClick={() => void run(async () => { await confirmTripOptimization(day.id, optimization.value.optimized_stop_ids); setOptimization(null); await reload(trip.id) })}><Check size={11} />Accepter</button></div>}<DaySettings open={openDaySettingsIds.has(day.id)} day={day} summary={daySummaries[day.id]} canEdit={canEdit} busy={busy} endsAtHotel={trip.nights.some((night) => night.previous_day_id === day.id)} onTimingSave={async (payload) => { await updateTripDayTiming(day.id, payload); await reload(trip.id) }} onColorSave={(color) => void run(async () => { await updateTripDay(day.id, { color }); await reload(trip.id) })} /></div>
          </details>
          {canEdit && <InsertDayControl day={day} onInsert={() => insertDayAfter(day)} />}
          {dayIndex === trip.days.length - 1 && <Arrival trip={trip} canEdit={canEditTrip} reload={reload} collapseRequest={timelineCollapseRequest} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} />}
        </div>)}</div></DayCollapseContext.Provider>
      </section>
    </>}</>}</>}
    {createOpen && <CreateTripDialog mapName={poiMap.name} onClose={() => setCreateOpen(false)} onCreate={async (payload) => { const created = await createTrip(poiMap.id, payload); await reload(created.id); setCreateOpen(false) }} />}
    {confirmationDialog}
    </>}
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
  const loadLabels: Record<Exclude<TripDayTimeSummary['load_level'], 'unavailable'>, string> = { low: 'Faible', medium: 'Modérée', high: 'Élevée' }
  const loadStyle = summary?.load_color ? { '--trip-load-color': summary.load_color } as CSSProperties : undefined
  return <span className="trip-day-header-metrics" aria-label="Résumé de la journée">
    {summary && summary.load_level !== 'unavailable' && <span className="trip-day-load-label" style={loadStyle}><span>Charge :</span><strong>{loadLabels[summary.load_level]}</strong></span>}
    <span><Route aria-hidden="true" size={12} />{formatRouteDistance(summary?.route_distance_meters ?? null)}</span>
    <span><Car aria-hidden="true" size={12} />{formatMinutes(summary?.route_duration_minutes ?? null)}</span>
    <span><Clock3 aria-hidden="true" size={12} />{formatMinutes(summary?.total_duration_minutes ?? null)}</span>
  </span>
}

function stopTypeLabel(value: Trip['days'][number]['stops'][number]['stop_type']) {
  return ({ free_location: 'Étape libre', hotel: 'Hôtel', restaurant: 'Restaurant', parking: 'Parking', station: 'Gare', airport: 'Aéroport', other: 'Autre', place: 'Lieu' } as const)[value]
}

function OptimizationMetrics({ value }: { value: TripOptimization }) { return <div className="trip-optimization-comparison" aria-label="Comparaison de l’optimisation"><div><strong>Avant</strong><span>Distance : {formatRouteDistance(value.before_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.before_duration_seconds)}</span></div><div><strong>Après</strong><span>Distance : {formatRouteDistance(value.after_distance_meters)}</span><span>Conduite : {formatRouteDuration(value.after_duration_seconds)}</span></div><div><strong>Gain</strong><span>Distance : {formatRouteDistance(value.distance_gain_meters)}</span><span>Conduite : {formatRouteDuration(value.duration_gain_seconds)}</span></div></div> }

function GlobalOptimizationReview({ proposals, busy, onCancel, onApply }: { proposals: Array<{ dayId: string; dayNumber: number; value: TripOptimization }>; busy: boolean; onCancel: () => void; onApply: () => void }) {
  const totalDistanceGain = proposals.reduce((total, proposal) => total + proposal.value.distance_gain_meters, 0)
  const totalDurationGain = proposals.reduce((total, proposal) => total + proposal.value.duration_gain_seconds, 0)
  return <section className="trip-panel-global-optimization" aria-live="polite" aria-labelledby="global-optimization-title">
    <header><div><p className="cv-workspace-panel__eyebrow">Optimisation prête</p><h3 id="global-optimization-title">Résultat pour {proposals.length} {proposals.length > 1 ? 'journées' : 'journée'}</h3></div><span>Gain total : {formatRouteDistance(totalDistanceGain)} · {formatRouteDuration(totalDurationGain)}</span></header>
    <ul>{proposals.map((proposal) => <li key={proposal.dayId}><strong>Jour {proposal.dayNumber}</strong><OptimizationMetrics value={proposal.value} /></li>)}</ul>
    <footer><button type="button" disabled={busy} onClick={onCancel}>Annuler</button><button className="primary" type="button" disabled={busy} onClick={onApply}><Check size={12} />Appliquer l’optimisation</button></footer>
  </section>
}
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

function DaySettings({ open, day, summary, canEdit, busy, endsAtHotel, onTimingSave, onColorSave }: { open: boolean; day: TripDay; summary: TripDayTimeSummary | undefined; canEdit: boolean; busy: boolean; endsAtHotel: boolean; onTimingSave: (payload: TripDayTimingPayload) => Promise<void>; onColorSave: (color: string) => void }) {
  if (!open) return null
  return <section id={`trip-day-settings-${day.id}`} className="trip-day-settings" aria-label={`Paramètres du jour ${day.day_number}`}>
    <div className="trip-day-settings__body">
      <section className="trip-day-color-section"><h4>Couleur du jour</h4><DayColorPicker day={day} disabled={!canEdit || busy} onSave={onColorSave} /></section>
      <DayTimingSettings day={day} summary={summary} canEdit={canEdit} busy={busy} endsAtHotel={endsAtHotel} onSave={onTimingSave} />
    </div>
  </section>
}

function DayVisibilityToggle({ day, hidden, onChange }: { day: TripDay; hidden: boolean; onChange: (visible: boolean) => void }) {
  const dayCollapse = useContext(DayCollapseContext)
  const hasMapContent = day.stops.length > 0 || Boolean(day.route_geometry?.coordinates.length)
  const visible = hasMapContent && !hidden
  const label = !hasMapContent ? `Jour ${day.day_number} sans contenu cartographique` : `${hidden ? 'Afficher' : 'Masquer'} le jour ${day.day_number} sur la carte`
  const collapsed = dayCollapse?.collapsedDayIds.has(day.id) ?? false
  return <><button className="trip-day-visibility-toggle" type="button" role="switch" aria-checked={visible} aria-label={label} title={label} disabled={!hasMapContent} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(hidden) }}>{visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>{dayCollapse && <button className="trip-day-collapse-toggle trip-day-collapse-toggle--inline" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} le jour ${day.day_number}`} aria-expanded={!collapsed} onClick={(event) => { event.preventDefault(); event.stopPropagation(); dayCollapse.onToggle(day.id) }}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>}</>
}

function FreeStop({ day, poiMap, reload }: { day: TripDay; poiMap: PoiMap; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const anchor = day.stops.at(-1)
  return <><button className="trip-panel-free-stop" type="button" aria-label="Ajouter un Lieu libre" title="Ajouter un lieu libre" onClick={() => setOpen(true)}><span aria-hidden="true" /><i aria-hidden="true"><Plus size={14} /></i><span aria-hidden="true" /></button>{open && <CreateTripNightDialog kind="stop" mapName={poiMap.name} countryCode={poiMap.country.iso_alpha2} focus={[anchor?.latitude ?? poiMap.effective_center_latitude, anchor?.longitude ?? poiMap.effective_center_longitude]} onClose={() => setOpen(false)} onCreate={async (payload) => { await addTripStop(day.id, { ...payload }); await reload(); setOpen(false) }} />}</>
}

type TimelineCollapseRequest = { collapsed: boolean; version: number }

function Departure({ trip, recommendedStart, recommendedStartOffset, canEdit, reload, collapseRequest, onStopFocus, onStopPlaceSelect }: { trip: Trip; recommendedStart: string | null; recommendedStartOffset: number | null; canEdit: boolean; reload: (id?: string) => Promise<void>; collapseRequest: TimelineCollapseRequest; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect: (placeId: string) => void }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const anchor = trip.days[0]?.stops[0]
  const departure = trip.departure
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    if (departure || !canEdit) return
    const value = event.dataTransfer.getData('text/plain')
    if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) })
  }
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  const focusDeparture = () => {
    if (!departure) return
    onStopFocus?.(departure.latitude, departure.longitude)
    if (departure.place_id) onStopPlaceSelect(departure.place_id)
  }

  return <>
    <div
      className={`trip-panel-night trip-panel-departure${departure ? '' : ' is-empty'}${canEdit && !departure ? ' drop-enabled' : ''}${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      onDragEnter={(event) => { if (!departure && canEdit) { event.preventDefault(); setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
      onDragOver={(event) => { if (!departure && canEdit) event.preventDefault() }}
      onDrop={drop}
    >
      <span className="trip-timeline-anchor-badge"><MapPin aria-hidden="true" size={15} /></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row">
          <span className="trip-panel-timeline-heading"><strong>Départ</strong><TimelineStatusBadge status={departure ? 'valid' : 'empty'} /></span>
          <span className="trip-night-header-actions">
            <span className="trip-anchor-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}><span>Départ conseillé</span><Clock3 aria-hidden="true" size={12} /><strong>{recommendedLabel}</strong></span>
            <button className="trip-day-collapse-toggle trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} le départ`} aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (departure
          ? <div className="trip-night-stop" role="button" tabIndex={0} aria-label={departure.place_id ? 'POI' : 'Point cartographique'} onClick={focusDeparture} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusDeparture() } }}>
              <MapPin aria-hidden="true" size={14} />
              <span className="trip-night-stop-copy"><strong>{departure.name}</strong><small>{departure.place_id ? 'POI' : 'Point cartographique'}</small></span>
              {canEdit && <button type="button" aria-label="Modifier le point de départ" onClick={(event) => { event.stopPropagation(); setDialog({ edit: true }) }}><Pencil size={11} /></button>}
            </div>
          : <div className="trip-night-placeholder">
              {dropActive ? <span className="trip-night-drop-indicator">Déposer ici</span> : <><span>Glissez un POI depuis le panneau Lieux</span>{canEdit && <button type="button" onClick={() => setDialog({})}><Plus size={11} />Ajouter</button>}</>}
            </div>)}
      </div>
    </div>
    {dialog && <CreateTripNightDialog kind="departure" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? departure?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && departure && !departure.place_id ? departure : undefined} initialNotes={dialog.edit ? departure?.notes : undefined} initialDepartureTime={dialog.edit ? departure?.departure_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && departure) await updateTripDeparture(departure.id, payload); else await addTripDeparture(trip.id, payload); await reload(trip.id); setDialog(null) }} />}
  </>
}

function Arrival({ trip, canEdit, reload, collapseRequest, onStopFocus, onStopPlaceSelect }: { trip: Trip; canEdit: boolean; reload: (id?: string) => Promise<void>; collapseRequest: TimelineCollapseRequest; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect: (placeId: string) => void }) {
  const [dialog, setDialog] = useState<{ placeId?: string; edit?: boolean } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const anchor = trip.days.at(-1)?.stops.at(-1) ?? trip.departure
  const arrival = trip.arrival
  const effectiveArrival = arrival ?? trip.departure
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    if (arrival || !canEdit) return
    const value = event.dataTransfer.getData('text/plain')
    if (value.startsWith('place:')) setDialog({ placeId: value.slice(6) })
  }
  const focusArrival = () => {
    if (!effectiveArrival) return
    onStopFocus?.(effectiveArrival.latitude, effectiveArrival.longitude)
    if (effectiveArrival.place_id) onStopPlaceSelect(effectiveArrival.place_id)
  }

  return <>
    <div
      className={`trip-panel-night trip-panel-arrival${effectiveArrival ? '' : ' is-empty'}${canEdit && !arrival ? ' drop-enabled' : ''}${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      onDragEnter={(event) => { if (!arrival && canEdit) { event.preventDefault(); setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
      onDragOver={(event) => { if (!arrival && canEdit) event.preventDefault() }}
      onDrop={drop}
    >
      <span className="trip-timeline-anchor-badge trip-timeline-arrival-badge"><Flag aria-hidden="true" size={14} /></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row">
          <span className="trip-panel-timeline-heading"><strong>Arrivée</strong><TimelineStatusBadge status={effectiveArrival ? 'valid' : 'empty'} /></span>
          <span className="trip-night-header-actions">
            <button className="trip-day-collapse-toggle trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} l’arrivée`} aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (effectiveArrival
          ? <div className="trip-night-stop" role="button" tabIndex={0} aria-label={arrival ? (arrival.place_id ? 'POI' : 'Point cartographique') : 'Même point que le départ'} onClick={focusArrival} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusArrival() } }}>
              <MapPin aria-hidden="true" size={14} />
              <span className="trip-night-stop-copy"><strong>{effectiveArrival.name}</strong><small>{arrival ? (arrival.place_id ? 'POI' : 'Point cartographique') : 'Même point que le départ'}</small></span>
              {canEdit && <button type="button" aria-label={arrival ? 'Modifier le point d’arrivée' : 'Personnaliser le point d’arrivée'} onClick={(event) => { event.stopPropagation(); setDialog(arrival ? { edit: true } : {}) }}><Pencil size={11} /></button>}
            </div>
          : <div className="trip-night-placeholder">
              {dropActive ? <span className="trip-night-drop-indicator">Déposer ici</span> : <><span>Glissez un POI depuis le panneau Lieux</span>{canEdit && <button type="button" onClick={() => setDialog({})}><Plus size={11} />Personnaliser</button>}</>}
            </div>)}
      </div>
    </div>
    {dialog && <CreateTripNightDialog kind="arrival" mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.placeId ?? (dialog.edit ? arrival?.place_id ?? undefined : undefined)} initialLocation={dialog.edit && arrival && !arrival.place_id ? arrival : undefined} initialNotes={dialog.edit ? arrival?.notes : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && arrival) await updateTripArrival(arrival.id, payload); else await addTripArrival(trip.id, payload); await reload(trip.id); setDialog(null) }} />}
  </>
}

function Night({ trip, previous, next, recommendedStart, recommendedStartOffset, activeTarget, canEdit, reload, collapseRequest, onSelect, onStopFocus, onStopPlaceSelect }: { trip: Trip; previous: TripDay; next: TripDay; recommendedStart: string | null; recommendedStartOffset: number | null; activeTarget: TripNightTarget | null; canEdit: boolean; reload: (id?: string) => Promise<void>; collapseRequest: TimelineCollapseRequest; onSelect: (target: TripNightTarget) => void; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect: (placeId: string) => void }) {
  const night = trip.nights.find((item) => item.previous_day_id === previous.id && item.next_day_id === next.id)
  const [dialog, setDialog] = useState<{ edit?: boolean } | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
  const anchor = previous.stops.at(-1) ?? next.stops[0]
  const drop = (event: DragEvent) => {
    event.preventDefault(); setDropActive(false)
    if (!canEdit) return
    const draggedValue = event.dataTransfer.getData('text/plain')
    if (!draggedValue.startsWith('place:')) return
    const placeId = draggedValue.slice(6)
    if (!placeId) return
    setDropping(true); setDropError(null)
    void (async () => {
      try {
        if (night) await updateTripNight(night.id, { place_id: placeId, source_type: 'place' })
        else await addTripNight(trip.id, { previous_day_id: previous.id, next_day_id: next.id, place_id: placeId, source_type: 'place' })
        await reload(trip.id)
      } catch (caught) {
        setDropError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer cet hébergement.')
      } finally { setDropping(false) }
    })()
  }
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  const timelineColors = { '--trip-night-previous-color': previous.color ?? '#0FA68A', '--trip-night-next-color': next.color ?? '#0FA68A' } as CSSProperties
  const selection = { nightId: night?.id ?? null, previousDayId: previous.id, nextDayId: next.id }
  const selected = activeTarget?.previousDayId === previous.id && activeTarget.nextDayId === next.id
  const selectNight = () => onSelect(selection)
  const focusNightLocation = () => {
    if (!night) return
    onStopFocus?.(night.latitude, night.longitude)
    if (night.place_id) onStopPlaceSelect(night.place_id)
  }
  const removeNightLocation = () => {
    if (!night) return
    void (async () => { await deleteTripNight(night.id); await reload(trip.id) })()
  }
  return <>
    {dropError && <p className="trip-panel-error" role="alert">{dropError}</p>}
    <div
      className={`trip-panel-night${night ? '' : ' is-empty'}${canEdit ? ' drop-enabled' : ''}${selected ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      style={timelineColors}
      aria-busy={dropping}
      aria-pressed={selected}
      role="button"
      tabIndex={0}
      onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('button')) return; selectNight(); if (target.closest('.trip-night-stop')) focusNightLocation() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNight(); focusNightLocation() } }}
      onDragEnter={(event) => { if (canEdit && event.dataTransfer.types.includes('text/plain')) { setCollapsed(false); setDropActive(true) } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false) }}
      onDragOver={(event) => { if (canEdit) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true) } }}
      onDrop={drop}
    >
      <span className="trip-timeline-night-badge"><Moon aria-hidden="true" size={13} /><b>N{previous.day_number}</b></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row">
          <span className="trip-panel-timeline-heading"><strong>Nuit {previous.day_number}</strong><TimelineStatusBadge status={night ? 'valid' : 'empty'} /></span>
          <span className="trip-night-header-actions">
            <span className="trip-anchor-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}><span>Départ conseillé</span><Clock3 aria-hidden="true" size={12} /><strong>{recommendedLabel}</strong></span>
            <button className="trip-day-collapse-toggle trip-day-collapse-toggle--inline trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} la nuit ${previous.day_number}`} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (night ? <div className="trip-night-stop" aria-label={nightSourceLabel(night.source_type, night.place_id)}>
          <MapPin className="trip-stop-kind" aria-hidden="true" size={14} />
          <span className="trip-night-stop-copy">
            <strong>{dropping ? 'Enregistrement…' : night.name}</strong>
            <small>{nightSourceLabel(night.source_type, night.place_id)}</small>
          </span>
          {canEdit && <button type="button" aria-label="Retirer le lieu de la nuit" title="Retirer le lieu" onClick={removeNightLocation}><Trash2 size={11} /></button>}
        </div> : <div className="trip-night-placeholder">{dropActive
          ? <span className="trip-night-drop-indicator" aria-hidden="true"><Plus size={12} />Déposer ici</span>
          : 'Glissez des POI depuis le panneau Lieux'}</div>)}
      </div>
    </div>
    {dialog && <CreateTripNightDialog previousDayId={previous.id} nextDayId={next.id} mode={dialog.edit ? 'edit' : 'create'} focus={[anchor?.latitude ?? 46.2276, anchor?.longitude ?? 2.2137]} initialPlaceId={dialog.edit ? night?.place_id ?? undefined : undefined} initialLocation={dialog.edit && night && !night.place_id ? night : undefined} initialSourceType={night?.source_type} initialNotes={dialog.edit ? night?.notes : undefined} initialCheckInTime={dialog.edit ? night?.check_in_time : undefined} initialCheckOutTime={dialog.edit ? night?.check_out_time : undefined} onClose={() => setDialog(null)} onCreate={async (payload) => { if (dialog.edit && night) await updateTripNight(night.id, payload); else await addTripNight(trip.id, payload); await reload(trip.id); setDialog(null) }} />}
  </>
}

function nightSourceLabel(sourceType: Trip['nights'][number]['source_type'] | undefined, placeId: string | null) {
  const source = sourceType ?? (placeId ? 'place' : 'map')
  return source === 'place' ? 'POI' : source === 'imported_text' ? 'Texte de réservation' : 'Point cartographique'
}

type TimelineStatus = 'valid' | 'pending' | 'empty'

function getDayTimelineStatus(day: TripDay, summary: TripDayTimeSummary | undefined): TimelineStatus {
  if (day.stops.length === 0) return 'empty'
  const constraintNeedsAttention = summary?.country_constraint_status === 'unchecked'
    || summary?.country_constraint_status === 'invalid'
    || summary?.country_constraint_status === 'unavailable'
  return day.route_status === 'ready' && !summary?.route_is_stale && !constraintNeedsAttention ? 'valid' : 'pending'
}

function TimelineStatusBadge({ status }: { status: TimelineStatus }) {
  const labels: Record<TimelineStatus, string> = { valid: 'Valide', pending: 'Non calculé', empty: 'Vide' }
  return <span className={`trip-timeline-status trip-timeline-status--${status}`}><span>Statut :</span><strong>{labels[status]}</strong></span>
}

function canCalculateRoute(trip: Trip, day: TripDay, dayIndex: number) { const hasInheritedStart = dayIndex > 0 && trip.days[dayIndex - 1]?.stops.length > 0; const hasStart = dayIndex === 0 ? trip.departure !== null : trip.nights.some((night) => night.next_day_id === day.id) || hasInheritedStart; const hasEnd = trip.nights.some((night) => night.previous_day_id === day.id) || dayIndex === trip.days.length - 1 && (trip.arrival ?? trip.departure) !== null; return day.stops.length + Number(hasStart) + Number(hasEnd) >= 2 }
function readLoadSettings(trip: Trip): TripLoadSettings { return { low_load_max_minutes: trip.low_load_max_minutes, medium_load_max_minutes: trip.medium_load_max_minutes, low_load_color: trip.low_load_color, medium_load_color: trip.medium_load_color, high_load_color: trip.high_load_color } }
