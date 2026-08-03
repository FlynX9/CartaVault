import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Archive, ArchiveRestore, BadgeCheck, Calculator, CalendarDays, Car, Check, ChevronDown, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, CircleAlert, Clock3, Copy, Download, ExternalLink, Eye, EyeOff, Flag, Gauge, GitCommitHorizontal, GripVertical, LoaderCircle, Lock, MapPin, Moon, Navigation, Play, Plus, Road, Route, Save, Settings2, SlidersHorizontal, Sparkles, SquareChevronDown, SquareChevronUp, Sun, Timer, Trash2 } from 'lucide-react'

import { addTripArrival, addTripDay, addTripDeparture, addTripNight, addTripStop, archiveTrip, calculateTripDayRoute, confirmTripOptimization, createTrip, deleteTrip, deleteTripArrival, deleteTripDay, deleteTripDeparture, deleteTripNight, deleteTripStop, downloadTripExport, duplicateTrip, duplicateTripDay, exportTripGpx, exportTripPdf, getTrip, getTripDaySummary, getTripSummary, listTrips, moveTripStop, optimizeTripDay, reorderTripDays, restoreTripState, tripExportUrl, unarchiveTrip, updateTrip, updateTripArrival, updateTripDay, updateTripDayTiming, updateTripDeparture, updateTripLoadSettings, updateTripNight, updateTripStop, type TripPdfExportOptions } from '../../api/trips'
import type { PoiMap } from '../../types/map'
import type { Trip, TripDay, TripDayTimeSummary, TripDayTimingPayload, TripLoadSettings, TripNightTarget, TripOptimization, TripSummary } from '../../types/trip'
import { CreateTripDialog } from './CreateTripDialog'
import { formatClock, formatMinutes, formatRouteDistance, formatRouteDuration } from './tripMetrics'
import { DayTimingSettings, TripLoadSettingsForm, VisitDurationControl } from './TripTimePlanning'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { EmptyState } from '../common/EmptyState'
import { TripPdfExportDialog } from './TripPdfExportDialog'
import { UnsavedChangesDialog } from '../common/UnsavedChangesDialog'
import { recordReversibleAction } from '../../ui/actionHistory'

export type UnsavedTripSettingsGuard = () => Promise<boolean>

interface Props { poiMap: PoiMap; trip: Trip | null; activeDayId: string | null; activeAnchorTarget?: 'departure' | 'arrival' | null; tripViewOnly?: boolean; hiddenDayIds?: ReadonlySet<string>; collapsed?: boolean; createRequest?: number; onCollapsedChange?: (collapsed: boolean) => void; onTripViewOnlyChange?: (enabled: boolean) => void; onDayVisibilityChange?: (dayId: string, visible: boolean) => void; onTripChange: (trip: Trip | null) => void; onActiveDayChange: (id: string | null) => void; onActiveAnchorTargetChange?: (target: 'departure' | 'arrival' | null) => void; onActiveNightTargetChange?: (target: TripNightTarget | null, openPopup?: boolean) => void; onAnchorPopupChange?: (target: 'departure' | 'arrival' | null) => void; onAnchorPlaceDrop?: (target: 'departure' | 'arrival', placeId: string) => Promise<void>; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect?: (placeId: string) => void; onPreviewStopSelect?: (stopId: string | null) => void; onPreviewSelectionChange?: (key: string | null) => void; onUnsavedChangesGuardChange?: (guard: UnsavedTripSettingsGuard | null) => void; onClose: () => void }

const DayCollapseContext = createContext<{ collapsedDayIds: ReadonlySet<string>; onToggle: (dayId: string) => void } | null>(null)
const TripAnchorActionsContext = createContext<{ canEdit: boolean; reload: (id?: string) => Promise<void>; onOpenPopup: (target: 'departure' | 'arrival') => void; onPlaceDrop?: (target: 'departure' | 'arrival', placeId: string) => Promise<void> } | null>(null)
type TripActionKey = 'route-all' | 'optimize-all' | `route:${string}` | `optimize:${string}`

export function TripPlannerPanel({ poiMap, trip, activeDayId, activeAnchorTarget = null, tripViewOnly = false, hiddenDayIds = new Set<string>(), collapsed = false, createRequest = 0, onCollapsedChange = () => undefined, onTripViewOnlyChange = () => undefined, onDayVisibilityChange = () => undefined, onTripChange, onActiveDayChange, onActiveAnchorTargetChange = () => undefined, onActiveNightTargetChange = () => undefined, onAnchorPopupChange = () => undefined, onAnchorPlaceDrop, onStopFocus, onStopPlaceSelect = () => undefined, onPreviewStopSelect = () => undefined, onPreviewSelectionChange = () => undefined, onUnsavedChangesGuardChange = () => undefined }: Props) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const canEdit = poiMap.can_edit === true
  const isArchivedTrip = trip?.status === 'completed' || trip?.status === 'archived'
  const canEditTrip = canEdit && !isArchivedTrip
  const [trips, setTrips] = useState<Trip[]>([])
  const [optimization, setOptimization] = useState<{ dayId: string; value: TripOptimization } | null>(null)
  const [globalOptimization, setGlobalOptimization] = useState<Array<{ dayId: string; dayNumber: number; value: TripOptimization }> | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftStartDate, setDraftStartDate] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<TripActionKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pdfExportOpen, setPdfExportOpen] = useState(false)
  const [pdfExportTrigger, setPdfExportTrigger] = useState<HTMLElement | null>(null)
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ dayId: string; index: number } | null>(null)
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null)
  const [dayDropTarget, setDayDropTarget] = useState<{ dayId: string; index: number } | null>(null)
  const [routeFeedback, setRouteFeedback] = useState<string | null>(null)
  const [summary, setSummary] = useState<TripSummary | null>(null)
  const [daySummaries, setDaySummaries] = useState<Record<string, TripDayTimeSummary>>({})
  const [loadSettingsDraft, setLoadSettingsDraft] = useState<TripLoadSettings | null>(null)
  const [loadingTripId, setLoadingTripId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false)
  const [savingUnsavedChanges, setSavingUnsavedChanges] = useState(false)
  const [collapsedDayIds, setCollapsedDayIds] = useState<Set<string>>(() => new Set())
  const [timelineCollapseRequest, setTimelineCollapseRequest] = useState({ collapsed: false, version: 0 })
  const [openDaySettingsIds, setOpenDaySettingsIds] = useState<Set<string>>(() => new Set())
  const [activeNightTarget, setActiveNightTarget] = useState<TripNightTarget | null>(null)
  const [previewSelectionKey, setPreviewSelectionKey] = useState<string | null>(null)
  useEffect(() => onPreviewSelectionChange(previewSelectionKey), [onPreviewSelectionChange, previewSelectionKey])
  const activeDayIdRef = useRef(activeDayId)
  const onTripChangeRef = useRef(onTripChange)
  const onActiveDayChangeRef = useRef(onActiveDayChange)
  const onActiveNightTargetChangeRef = useRef(onActiveNightTargetChange)
  const onActiveAnchorTargetChangeRef = useRef(onActiveAnchorTargetChange)
  const loadControllerRef = useRef<AbortController | null>(null)
  const selectionVersionRef = useRef(0)
  const unsavedPromptResolverRef = useRef<((canLeave: boolean) => void) | null>(null)
  onTripChangeRef.current = onTripChange
  onActiveDayChangeRef.current = onActiveDayChange
  onActiveNightTargetChangeRef.current = onActiveNightTargetChange
  onActiveAnchorTargetChangeRef.current = onActiveAnchorTargetChange

  useEffect(() => { activeDayIdRef.current = activeDayId }, [activeDayId])
  useEffect(() => {
    const clearStopDropState = () => {
      setDraggedStopId(null)
      setDropTarget(null)
      setDraggedDayId(null)
      setDayDropTarget(null)
    }
    window.addEventListener('dragend', clearStopDropState)
    window.addEventListener('drop', clearStopDropState)
    return () => {
      window.removeEventListener('dragend', clearStopDropState)
      window.removeEventListener('drop', clearStopDropState)
    }
  }, [])
  useEffect(() => {
    if (createRequest > 0 && canEdit) setCreateOpen(true)
  }, [canEdit, createRequest])
  useEffect(() => {
    const dayIds = new Set(trip?.days.map((day) => day.id) ?? [])
    setCollapsedDayIds((current) => new Set([...current].filter((dayId) => dayIds.has(dayId))))
    setOpenDaySettingsIds((current) => new Set([...current].filter((dayId) => dayIds.has(dayId))))
  }, [trip])
  useEffect(() => setPreviewSelectionKey(null), [trip?.id])
  const loadTripDetails = useCallback(async (target: string, signal?: AbortSignal) => {
    const loaded = await getTrip(target, signal)
    const [loadedSummary, perDay] = await Promise.all([getTripSummary(target, signal), Promise.all(loaded.days.map((day) => getTripDaySummary(day.id, signal)))])
    return { loaded, loadedSummary, daySummaries: Object.fromEntries(perDay.map((item) => [item.day_id, item])) }
  }, [])
  const applyLoadedTrip = useCallback(({ loaded, loadedSummary, daySummaries: loadedDays }: Awaited<ReturnType<typeof loadTripDetails>>) => {
    onTripChangeRef.current(loaded); setSummary(loadedSummary); setDaySummaries(loadedDays); setDraftName(loaded.name); setDraftStartDate(loaded.start_date); setLoadSettingsDraft(readLoadSettings(loaded))
    const currentDayId = activeDayIdRef.current
    onActiveDayChangeRef.current(loaded.days.some((day) => day.id === currentDayId) ? currentDayId : loaded.days[0]?.id ?? null)
  }, [])
  const selectTrip = useCallback(async (target: string) => {
    selectionVersionRef.current += 1
    loadControllerRef.current?.abort()
    setActiveNightTarget(null)
    onActiveNightTargetChangeRef.current(null)
    onActiveAnchorTargetChangeRef.current(null)
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
  const reload = useCallback(async (id = trip?.id) => {
    const items = await listTrips(poiMap.id); setTrips(items)
    const target = id && items.some((item) => item.id === id) ? id : items[0]?.id
    if (!target) { loadControllerRef.current?.abort(); onTripChangeRef.current(null); onActiveDayChangeRef.current(null); setSummary(null); setDaySummaries({}); setLoadingTripId(null); return }
    await selectTrip(target)
  }, [poiMap.id, selectTrip, trip?.id])
  const refreshTripSilently = async (id = trip?.id) => {
    if (!id) return
    const selectionVersion = selectionVersionRef.current
    const loaded = await getTrip(id)
    if (selectionVersion !== selectionVersionRef.current) return
    onTripChangeRef.current(loaded)
    setTrips((current) => current.map((item) => item.id === loaded.id ? loaded : item))

    void Promise.all([
      getTripSummary(id),
      Promise.all(loaded.days.map((day) => getTripDaySummary(day.id))),
    ]).then(([loadedSummary, perDay]) => {
      if (selectionVersion !== selectionVersionRef.current) return
      setSummary(loadedSummary)
      setDaySummaries(Object.fromEntries(perDay.map((item) => [item.day_id, item])))
    }).catch(() => undefined)
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

  const run = async (action: () => Promise<void>, actionKey?: TripActionKey) => {
    setBusy(true)
    if (actionKey) setPendingAction(actionKey)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Opération impossible.')
      return false
    } finally {
      if (actionKey) setPendingAction(null)
      setBusy(false)
    }
  }
  const runUndoable = async (label: string, action: () => Promise<void>) => {
    if (!trip) return
    const tripId = trip.id
    const before = await getTrip(tripId)
    await action()
    const after = await getTrip(tripId)
    const restore = async (state: Trip) => {
      await restoreTripState(tripId, state)
      await reload(tripId)
    }
    recordReversibleAction({ label, undo: () => restore(before), redo: () => restore(after) })
  }
  const savedLoadSettings = useMemo(() => trip ? readLoadSettings(trip) : null, [trip])
  const activeLoadSettings = loadSettingsDraft ?? savedLoadSettings
  const hasUnsavedSettings = Boolean(trip && activeLoadSettings && (
    draftName !== trip.name
    || draftStartDate !== trip.start_date
    || !sameLoadSettings(activeLoadSettings, savedLoadSettings!)
  ))
  const discardSettingsDraft = useCallback(() => {
    if (!trip) return
    setDraftName(trip.name)
    setDraftStartDate(trip.start_date)
    setLoadSettingsDraft(readLoadSettings(trip))
  }, [trip])
  const saveSettings = useCallback(async () => {
    if (!trip || !activeLoadSettings || !hasUnsavedSettings) return true
    return run(async () => {
      const tripChanges: Partial<Pick<Trip, 'name' | 'start_date'>> = {}
      if (draftName !== trip.name) tripChanges.name = draftName
      if (draftStartDate !== trip.start_date) tripChanges.start_date = draftStartDate
      if (Object.keys(tripChanges).length > 0) await updateTrip(trip.id, tripChanges)
      if (!sameLoadSettings(activeLoadSettings, readLoadSettings(trip))) await updateTripLoadSettings(trip.id, activeLoadSettings)
      await reload(trip.id)
    })
  }, [activeLoadSettings, draftName, draftStartDate, hasUnsavedSettings, reload, trip])
  const settleUnsavedPrompt = useCallback((canLeave: boolean) => {
    unsavedPromptResolverRef.current?.(canLeave)
    unsavedPromptResolverRef.current = null
    setUnsavedPromptOpen(false)
  }, [])
  const requestSettingsLeave = useCallback(() => {
    if (!hasUnsavedSettings) return Promise.resolve(true)
    unsavedPromptResolverRef.current?.(false)
    setUnsavedPromptOpen(true)
    return new Promise<boolean>((resolve) => { unsavedPromptResolverRef.current = resolve })
  }, [hasUnsavedSettings])
  const saveAndContinue = useCallback(async () => {
    setSavingUnsavedChanges(true)
    const saved = await saveSettings()
    setSavingUnsavedChanges(false)
    if (saved) settleUnsavedPrompt(true)
  }, [saveSettings, settleUnsavedPrompt])
  const discardAndContinue = useCallback(() => {
    discardSettingsDraft()
    settleUnsavedPrompt(true)
  }, [discardSettingsDraft, settleUnsavedPrompt])
  useEffect(() => {
    onUnsavedChangesGuardChange(hasUnsavedSettings ? requestSettingsLeave : null)
    return () => onUnsavedChangesGuardChange(null)
  }, [hasUnsavedSettings, onUnsavedChangesGuardChange, requestSettingsLeave])
  useEffect(() => {
    if (!hasUnsavedSettings) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnsavedSettings])
  useEffect(() => () => unsavedPromptResolverRef.current?.(false), [])

  const changeSelectedTrip = (target: string) => {
    if (!hasUnsavedSettings) {
      void selectTrip(target)
      return
    }
    void requestSettingsLeave().then((canLeave) => { if (canLeave) void selectTrip(target) })
  }
  const toggleSettings = () => {
    if (!settingsOpen || !hasUnsavedSettings) {
      setSettingsOpen((current) => !current)
      return
    }
    void requestSettingsLeave().then((canLeave) => { if (canLeave) setSettingsOpen(false) })
  }
  const reorderDay = (dayId: string, targetIndex: number) => {
    if (!trip || !canEditTrip) return
    const ids = trip.days.map((day) => day.id)
    const sourceIndex = ids.indexOf(dayId)
    if (sourceIndex < 0) return
    ids.splice(sourceIndex, 1)
    const insertionIndex = Math.max(0, Math.min(ids.length, targetIndex - Number(sourceIndex < targetIndex)))
    ids.splice(insertionIndex, 0, dayId)
    if (ids.every((id, index) => id === trip.days[index]?.id)) return
    void run(() => runUndoable('déplacement de la journée', async () => { await reorderTripDays(trip.id, ids); await reload(trip.id) }))
  }
  const insertDayAfter = (day: TripDay) => {
    if (!trip || !canEditTrip) return
    void run(() => runUndoable('ajout de la journée', async () => { await addTripDay(trip.id, { after_day_id: day.id }); await reload(trip.id) }))
  }
  const drop = (event: DragEvent, day: TripDay) => {
    if (!canEditTrip) return
    event.preventDefault(); const data = event.dataTransfer.getData('text/plain')
    if (data.startsWith('place:')) void run(() => runUndoable('ajout de l’étape', async () => { await addTripStop(day.id, { place_id: data.slice(6), stop_type: 'place' }); await refreshTripSilently(trip!.id) }))
    if (data.startsWith('stop:')) void run(() => runUndoable('déplacement de l’étape', async () => { await moveTripStop(data.slice(5), day.id, day.stops.length); await refreshTripSilently(trip!.id) }))
  }
  const dropStop = (event: DragEvent, day: TripDay, index: number) => {
    if (!canEditTrip) return
    event.preventDefault(); event.stopPropagation(); const data = event.dataTransfer.getData('text/plain')
    setDraggedStopId(null); setDropTarget(null)
    if (data.startsWith('place:')) {
      const placeId = data.slice(6)
      if (!placeId) return
      void run(() => runUndoable('ajout de l’étape', async () => {
        const created = await addTripStop(day.id, { place_id: placeId, stop_type: 'place' })
        if (index < day.stops.length) await moveTripStop(created.id, day.id, index)
        await refreshTripSilently(trip!.id)
      }))
      return
    }
    if (!data.startsWith('stop:')) return
    const stopId = data.slice(5)
    if (!stopId) return
    void run(() => runUndoable('déplacement de l’étape', async () => { await moveTripStop(stopId, day.id, index); await refreshTripSilently(trip!.id) }))
  }
  const recalculateRoute = (day: TripDay) => void run(async () => {
    if (!canEditTrip) return
    await calculateTripDayRoute(day.id); await reload(trip!.id); setRouteFeedback(day.id)
    window.setTimeout(() => setRouteFeedback((current) => current === day.id ? null : current), 1600)
  }, `route:${day.id}`)
  const recalculateAllRoutes = () => {
    if (!trip || !canEditTrip) return
    const routableDays = trip.days.filter((day, dayIndex) => canCalculateRoute(trip, day, dayIndex))
    if (!routableDays.length) return
    void run(async () => {
      for (const day of routableDays) await calculateTripDayRoute(day.id)
      await reload(trip.id)
      setRouteFeedback('all')
      window.setTimeout(() => setRouteFeedback((current) => current === 'all' ? null : current), 1600)
    }, 'route-all')
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
    }, 'optimize-all')
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
  const exportPdf = async (options: TripPdfExportOptions) => {
    const item = await exportTripPdf(trip!.id, options)
    const blob = await downloadTripExport(item.download_url)
    downloadFile(blob, item.file_name)
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
  const activateDay = (dayId: string) => { setActiveNightTarget(null); onActiveNightTargetChange(null); onActiveAnchorTargetChange(null); onActiveDayChange(dayId) }
  const setAllTimelineCollapsed = (nextCollapsed: boolean) => {
    setCollapsedDayIds(nextCollapsed ? new Set(trip?.days.map((day) => day.id) ?? []) : new Set())
    setTimelineCollapseRequest((current) => ({ collapsed: nextCollapsed, version: current.version + 1 }))
  }

  const tripName = trip?.name ?? 'Préparation'

  return <aside className={`map-sidebar trip-planner-panel${tripViewOnly ? ' trip-planner-panel--trip-view' : ''}${isArchivedTrip ? ' trip-planner-panel--read-only' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="Préparation de sortie">
    {collapsed ? <header className="trip-panel-header trip-panel-header--collapsed cv-workspace-panel__header"><div className="cv-workspace-panel__heading"><h2 className="cv-workspace-panel__title">Sortie</h2><span className="trip-panel-collapsed-name" title={tripName}>{tripName}</span></div><button className="panel-icon-button trip-panel-collapse-toggle" type="button" aria-label="Développer le panneau Sortie" aria-expanded="false" onClick={() => onCollapsedChange(false)}><SquareChevronDown size={18} /></button></header> : <>
    <header className="trip-panel-header places-redesign-header"><div><div className="trip-panel-title-row places-redesign-title-row"><h2>{tripViewOnly ? 'Chronologie' : 'Sortie'}</h2>{trip && <span className={`places-redesign-count trip-panel-trip-status trip-panel-trip-status--${trip.status === 'completed' || trip.status === 'archived' ? 'completed' : 'active'}`}>{trip.status === 'completed' || trip.status === 'archived' ? 'Terminée' : 'En cours'}</span>}</div>{trip && <p className="trip-panel-header-meta places-redesign-map-meta"><span className="trip-panel-header-name" title={trip.name}>{trip.name}</span><span aria-hidden="true">·</span><span className="trip-panel-header-day-count">{trip.days.length} {trip.days.length > 1 ? 'jours' : 'jour'}</span></p>}</div>{tripViewOnly && summary && <TripSummaryMetrics summary={summary} preview />}<div className="trip-panel-header-actions places-redesign-header-actions"><button className={`panel-icon-button trip-view-button${tripViewOnly ? ' active' : ''}`} type="button" aria-label={tripViewOnly ? 'Quitter la chronologie du voyage' : 'Activer la chronologie du voyage'} aria-pressed={tripViewOnly} title={tripViewOnly ? 'Afficher la préparation complète' : 'Chronologie du voyage'} onClick={() => onTripViewOnlyChange(!tripViewOnly)}><GitCommitHorizontal size={16} /></button>{!tripViewOnly && <button className="panel-icon-button trip-panel-collapse-toggle" type="button" aria-label="Réduire le panneau Sortie" aria-expanded="true" onClick={() => onCollapsedChange(true)}><SquareChevronUp size={17} /></button>}</div></header>
    <div className="trip-panel-scroll" role="region" aria-label="Contenu de la sortie" tabIndex={0}>
    {tripViewOnly ? <div className="trip-panel-compact-summary">{summary && trip ? <TripPreviewTimeline trip={trip} activeDayId={activeDayId} selectedKey={previewSelectionKey} daySummaries={daySummaries} onSelectDay={(day) => { setPreviewSelectionKey(`day:${day.id}`); onPreviewStopSelect(null); activateDay(day.id) }} onSelectNight={(night) => { setPreviewSelectionKey(`night:${night.id}`); onPreviewStopSelect(null); const target = { nightId: night.id, previousDayId: night.previous_day_id, nextDayId: night.next_day_id }; setActiveNightTarget(target); onActiveNightTargetChange(target, true); onActiveDayChange(night.next_day_id) }} onSelectLocation={(key, dayId, stopId) => { setPreviewSelectionKey(key); onPreviewStopSelect(stopId); activateDay(dayId) }} onNavigateItem={(key, stopId) => { setPreviewSelectionKey(key); onPreviewStopSelect(stopId); if (key.startsWith('night:')) { const night = trip.nights.find((item) => `night:${item.id}` === key); if (night) { const target = { nightId: night.id, previousDayId: night.previous_day_id, nextDayId: night.next_day_id }; setActiveNightTarget(target); onActiveNightTargetChange(target, true) } } else { setActiveNightTarget(null); onActiveNightTargetChange(null) } }} /> : <div className="trip-panel-empty" role="status"><Route size={24} /><strong>Chargement du résumé…</strong></div>}</div> : <>
    {error && <p className="trip-panel-error" role="alert">{error === 'Internal Server Error' ? 'Une erreur serveur empêche cette opération.' : error}</p>}
    <div className="trip-panel-selector"><select aria-label="Voyage actif" value={loadingTripId ?? trip?.id ?? ''} onChange={(event) => changeSelectedTrip(event.target.value)}><option value="">Choisir un voyage</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{canEdit && <button className="panel-icon-button primary" type="button" aria-label="Créer une sortie" title="Ajouter une sortie" onClick={() => setCreateOpen(true)}><Plus size={16} /></button>}{trip && <button className={`panel-icon-button trip-settings-button${settingsOpen ? ' active' : ''}`} type="button" aria-label={settingsOpen ? 'Masquer les paramètres de la sortie' : 'Afficher les paramètres de la sortie'} aria-expanded={settingsOpen} aria-pressed={settingsOpen} title="Paramètres de la sortie" onClick={toggleSettings}><SlidersHorizontal size={16} /></button>}{trip && <TripExportMenu onGpx={() => void run(exportGpx)} onPdf={(trigger) => { setPdfExportTrigger(trigger); setPdfExportOpen(true) }} />}</div>
    {loadingTripId ? <div className="trip-panel-empty" role="status"><Route size={28} /><strong>Chargement du voyage…</strong></div> : <>
    {!trip ? <EmptyState className="trip-panel-empty" icon={<Route size={28} />} title="Aucune sortie préparée" description="Créez un voyage puis ajoutez les POI depuis le panneau Lieux." /> : <>
      {settingsOpen && activeLoadSettings && <TripSettings trip={trip} canEdit={canEditTrip} canManage={canEdit} canDelete={canEditTrip && poiMap.can_delete === true} busy={busy} draftName={draftName} draftStartDate={draftStartDate} dirty={hasUnsavedSettings} loadSettings={activeLoadSettings} onNameChange={setDraftName} onStartDateChange={setDraftStartDate} onLoadSettingsChange={setLoadSettingsDraft} onSave={() => void saveSettings()} onDuplicate={() => void run(async () => { const copy = await duplicateTrip(trip.id); await reload(copy.id) })} onArchive={() => void run(async () => { await archiveTrip(trip.id); await reload(trip.id) })} onUnarchive={() => void run(async () => { await unarchiveTrip(trip.id); await reload(trip.id) })} onDelete={() => void confirm({ title: 'Placer cette sortie dans la corbeille ?', message: `La sortie « ${trip.name} » et toute sa planification pourront être restaurées pendant votre délai de conservation.` }).then((confirmed) => { if (confirmed) void run(async () => { await deleteTrip(trip.id); await reload('') }) })} />}
      {summary && <TripSummaryMetrics summary={summary} />}
      <section className="trip-panel-section trip-panel-journeys"><header className="trip-panel-journeys-header"><span className="trip-panel-journeys-header-actions">{canEdit && <span className="trip-panel-journeys-route-actions"><button className={routeFeedback === 'all' ? 'route-success' : undefined} type="button" aria-label={pendingAction === 'route-all' ? 'Calcul des itinéraires en cours' : routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'} title={pendingAction === 'route-all' ? 'Calcul des itinéraires en cours' : routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'} disabled={busy || !trip.days.some((day, dayIndex) => canCalculateRoute(trip, day, dayIndex))} onClick={recalculateAllRoutes}>{pendingAction === 'route-all' ? <LoaderCircle className="trip-action-spinner" size={13} aria-hidden="true" /> : routeFeedback === 'all' ? <Check size={13} /> : <Route size={13} />}<span>{pendingAction === 'route-all' ? 'Calcul en cours…' : routeFeedback === 'all' ? 'Itinéraires rafraîchis' : 'Calculer les itinéraires'}</span></button><button className="trip-global-optimize-button" type="button" aria-label={pendingAction === 'optimize-all' ? 'Optimisation du voyage en cours' : 'Optimiser le voyage'} title={pendingAction === 'optimize-all' ? 'Optimisation du voyage en cours' : 'Optimiser le voyage'} disabled={busy || globalOptimization !== null || !trip.days.some((day) => day.stops.length >= 2)} onClick={optimizeAllDays}>{pendingAction === 'optimize-all' ? <LoaderCircle className="trip-action-spinner" size={13} aria-hidden="true" /> : <Sparkles size={13} />}<span>{pendingAction === 'optimize-all' ? 'Optimisation…' : 'Optimiser le voyage'}</span></button></span>}<span className="trip-panel-journeys-toggle-actions"><button type="button" aria-label="Tout déplier" title="Tout déplier" onClick={() => setAllTimelineCollapsed(false)}><ChevronsDown size={13} /><span>Tout déplier</span></button><button type="button" aria-label="Tout replier" title="Tout replier" onClick={() => setAllTimelineCollapsed(true)}><ChevronsUp size={13} /><span>Tout replier</span></button></span></span></header>
        {globalOptimization && <GlobalOptimizationReview proposals={globalOptimization} busy={busy} onCancel={() => setGlobalOptimization(null)} onApply={applyGlobalOptimization} />}
        <TripAnchorActionsContext.Provider value={{ canEdit: canEditTrip, reload, onOpenPopup: (target) => onAnchorPopupChange(target), onPlaceDrop: onAnchorPlaceDrop }}>
        <DayCollapseContext.Provider value={{ collapsedDayIds, onToggle: toggleDayCollapsed }}><div className="trip-panel-days">{trip.days[0] && <Departure trip={trip} selected={activeAnchorTarget === 'departure'} recommendedStart={daySummaries[trip.days[0].id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[trip.days[0].id]?.recommended_start_day_offset ?? null} collapseRequest={timelineCollapseRequest} onSelect={() => { setActiveNightTarget(null); onActiveNightTargetChange(null); onActiveAnchorTargetChange('departure'); onActiveDayChange(trip.days[0].id) }} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} />}{trip.days.map((day, dayIndex) => <div key={day.id} className={`trip-timeline-day-block${draggedDayId === day.id ? ' is-dragging' : ''}${dayDropTarget?.dayId === day.id && dayDropTarget.index === dayIndex ? ' drop-before' : ''}${dayDropTarget?.dayId === day.id && dayDropTarget.index === dayIndex + 1 ? ' drop-after' : ''}`} style={{ '--trip-day-color': day.color ?? '#0FA68A' } as CSSProperties} onDragLeave={(event) => { if (draggedDayId && !event.currentTarget.contains(event.relatedTarget as Node | null)) setDayDropTarget(null) }} onDragOver={(event) => { if (!draggedDayId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDayDropTarget({ dayId: day.id, index: dayIndex + Number(event.clientY > bounds.top + bounds.height / 2) }) }} onDrop={(event) => { if (!draggedDayId) return; event.preventDefault(); event.stopPropagation(); const targetIndex = dayDropTarget?.dayId === day.id ? dayDropTarget.index : dayIndex; const sourceId = draggedDayId; setDraggedDayId(null); setDayDropTarget(null); reorderDay(sourceId, targetIndex) }}>
          <details className={`trip-panel-day${day.id === activeDayId && activeNightTarget === null ? ' is-active' : ''}`} open={!collapsedDayIds.has(day.id)} onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('button, input, select, textarea, a')) return; activateDay(day.id); if (target.closest('.trip-panel-day > summary')) event.preventDefault() }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget((current) => current?.dayId === day.id ? null : current) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day)}>
            <summary className={canEdit ? 'trip-day-drag-surface' : undefined} draggable={canEdit} onDragStart={(event) => { if (!canEdit) return; event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-cartavault-day', day.id); setDraggedDayId(day.id); setDayDropTarget(null) }} onDragEnd={() => { setDraggedDayId(null); setDayDropTarget(null) }}><DayVisibilityBubble day={day} hidden={hiddenDayIds.has(day.id)} onChange={(visible) => onDayVisibilityChange(day.id, visible)} /><span className="trip-panel-day-heading"><span className="trip-panel-timeline-heading"><strong>{day.title || `Jour ${day.day_number}`}</strong></span><small>{day.stops.length} {day.stops.length > 1 ? 'étapes' : 'étape'}</small></span><DayHeaderMetrics summary={daySummaries[day.id]} status={getDayTimelineStatus(day, daySummaries[day.id])} /><span className="trip-panel-day-actions"><DayCollapseToggle day={day} /></span></summary>
            <div className="trip-panel-day-content">{day.route_status === 'stale' && <p>Itinéraire à recalculer</p>}{daySummaries[day.id]?.country_constraint_status === 'unchecked' && <p className="trip-metrics-warning">Itinéraire à vérifier avec la contrainte pays.</p>}{daySummaries[day.id]?.country_constraint_status === 'invalid' && <p className="trip-panel-error">Itinéraire refusé : passage hors de {daySummaries[day.id]?.constraint_country_name}.</p>}
              <ul>{day.stops.map((stop, index) => <li key={stop.id} className={`${draggedStopId === stop.id ? 'is-dragging' : ''}${dropTarget?.dayId === day.id && dropTarget.index === index ? ' drop-before' : ''}${index === day.stops.length - 1 && dropTarget?.dayId === day.id && dropTarget.index === day.stops.length ? ' drop-after' : ''}`} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `stop:${stop.id}`); setDraggedStopId(stop.id) }} onDragEnd={() => { setDraggedStopId(null); setDropTarget(null) }} onDragOver={(event) => { if (!canEdit || draggedDayId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropTarget({ dayId: day.id, index: index + Number(event.clientY > bounds.top + bounds.height / 2) }) }} onDrop={(event) => { if (!draggedDayId) dropStop(event, day, dropTarget?.dayId === day.id ? dropTarget.index : index) }}><GripVertical className="trip-stop-grip" size={13} /><i>{index + 1}</i><MapPin className="trip-stop-kind" aria-hidden="true" size={14} /><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); activateDay(day.id); onStopFocus?.(stop.latitude, stop.longitude); if (stop.place_id) onStopPlaceSelect(stop.place_id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activateDay(day.id); onStopFocus?.(stop.latitude, stop.longitude); if (stop.place_id) onStopPlaceSelect(stop.place_id) } }}><strong>{stop.name}</strong>{stop.stop_type !== 'place' && <small>{stopTypeLabel(stop.stop_type)}</small>}</span>{!canEdit && <span className="trip-stop-duration"><Clock3 aria-hidden="true" size={12} />{formatMinutes(stop.visit_duration_minutes)}</span>}<span className="trip-stop-drive"><Car aria-hidden="true" size={12} />{formatRouteDuration(day.route_segments?.[index]?.duration_seconds ?? null)}</span>{canEdit && <VisitDurationControl stop={stop} disabled={busy} onChange={async (minutes) => { await updateTripStop(stop.id, { visit_duration_minutes: minutes }); await reload(trip.id) }} />}{stop.is_locked && <Lock size={11} />}{canEdit && <span className="trip-panel-stop-actions"><button type="button" aria-label="Supprimer l’étape" onClick={(event) => { event.stopPropagation(); void confirm({ title: 'Supprimer cette étape ?', message: `« ${stop.name} » sera retirée de la journée.` }).then((confirmed) => { if (confirmed) void run(() => runUndoable('suppression de l’étape', async () => { await deleteTripStop(stop.id); await refreshTripSilently(trip.id) })) }) }}><Trash2 size={11} /></button></span>}</li>)}</ul>
              {day.stops.length === 0 && <p className="trip-panel-drop">Glissez un POI ou utilisez la recherche de la carte</p>}<div className={`trip-panel-route-actions${canEdit ? ' trip-panel-route-actions--editable' : ''}`}><button className={routeFeedback === day.id ? 'route-success' : undefined} type="button" aria-label={pendingAction === `route:${day.id}` ? 'Calcul de l’itinéraire en cours' : routeFeedback === day.id ? 'Itinéraire rafraîchi' : 'Itinéraire'} disabled={busy || !canCalculateRoute(trip, day, dayIndex)} onClick={() => recalculateRoute(day)}>{pendingAction === `route:${day.id}` ? <><LoaderCircle className="trip-action-spinner" size={13} aria-hidden="true" />Calcul en cours…</> : routeFeedback === day.id ? <><Check size={13} />Itinéraire rafraîchi</> : <><Route size={13} />Itinéraire</>}</button><button type="button" aria-label={pendingAction === `optimize:${day.id}` ? 'Optimisation de la journée en cours' : 'Optimiser'} disabled={busy || day.stops.length < 2} onClick={() => void run(async () => setOptimization({ dayId: day.id, value: await optimizeTripDay(day.id) }), `optimize:${day.id}`)}>{pendingAction === `optimize:${day.id}` ? <><LoaderCircle className="trip-action-spinner" size={13} aria-hidden="true" />Optimisation…</> : <><Sparkles size={13} />Optimiser</>}</button>{canEdit && <><button type="button" aria-label="Dupliquer la journée" onClick={() => void run(() => runUndoable('duplication de la journée', async () => { await duplicateTripDay(day.id); await reload(trip.id) }))}><Copy size={13} />Dupliquer</button><button type="button" aria-label="Supprimer la journée" onClick={() => void confirm({ title: 'Supprimer cette journée ?', message: `Le jour ${day.day_number}, ses étapes et son itinéraire seront définitivement supprimés.` }).then((confirmed) => { if (confirmed) void run(() => runUndoable('suppression de la journée', async () => { await deleteTripDay(day.id); await reload(trip.id) })) })}><Trash2 size={13} />Supprimer</button></>}<button className="trip-day-settings-trigger" type="button" aria-expanded={openDaySettingsIds.has(day.id)} aria-controls={`trip-day-settings-${day.id}`} title="Réglages du jour" onClick={() => toggleDaySettings(day.id)}><Settings2 aria-hidden="true" size={13} />Réglages</button></div>{optimization?.dayId === day.id && <div className="trip-panel-optimization"><OptimizationMetrics value={optimization.value} /><button type="button" onClick={() => setOptimization(null)}>Refuser</button><button type="button" onClick={() => void run(() => runUndoable('optimisation de la journée', async () => { await confirmTripOptimization(day.id, optimization.value.optimized_stop_ids); setOptimization(null); await reload(trip.id) }))}><Check size={11} />Accepter</button></div>}<DaySettings open={openDaySettingsIds.has(day.id)} day={day} summary={daySummaries[day.id]} canEdit={canEdit} busy={busy} endsAtHotel={trip.nights.some((night) => night.previous_day_id === day.id)} onTimingSave={async (payload) => { await updateTripDayTiming(day.id, payload); await reload(trip.id) }} onColorSave={(color) => void run(async () => { await updateTripDay(day.id, { color }); await reload(trip.id) })} /></div>
          </details>
          {dayIndex < trip.days.length - 1 && <Night previous={day} next={trip.days[dayIndex + 1]} recommendedStart={daySummaries[trip.days[dayIndex + 1].id]?.recommended_start_time ?? null} recommendedStartOffset={daySummaries[trip.days[dayIndex + 1].id]?.recommended_start_day_offset ?? null} trip={trip} activeTarget={activeNightTarget} canEdit={canEditTrip} reload={reload} collapseRequest={timelineCollapseRequest} onSelect={(target, openPopup) => { setActiveNightTarget(target); onActiveAnchorTargetChange(null); onActiveNightTargetChange(target, openPopup); onActiveDayChange(trip.days[dayIndex + 1].id) }} onStopFocus={onStopFocus} />}
          {canEdit && <InsertDayControl day={day} onInsert={() => insertDayAfter(day)} />}
        </div>)}{trip.days.length > 0 && <Arrival trip={trip} selected={activeAnchorTarget === 'arrival'} estimatedArrival={daySummaries[trip.days.at(-1)!.id]?.estimated_arrival_time ?? null} estimatedArrivalOffset={daySummaries[trip.days.at(-1)!.id]?.estimated_arrival_day_offset ?? null} collapseRequest={timelineCollapseRequest} onSelect={() => { setActiveNightTarget(null); onActiveNightTargetChange(null); onActiveAnchorTargetChange('arrival'); onActiveDayChange(trip.days.at(-1)!.id) }} onStopFocus={onStopFocus} onStopPlaceSelect={onStopPlaceSelect} />}</div></DayCollapseContext.Provider>
        </TripAnchorActionsContext.Provider>
      </section>
    </>}</>}</>}
    </div>
    {createOpen && <CreateTripDialog mapName={poiMap.name} onClose={() => setCreateOpen(false)} onCreate={async (payload) => { const created = await createTrip(poiMap.id, payload); await reload(created.id); setCreateOpen(false) }} />}
    {pdfExportOpen && <TripPdfExportDialog trigger={pdfExportTrigger} onClose={() => setPdfExportOpen(false)} onExport={exportPdf} />}
    {unsavedPromptOpen && <UnsavedChangesDialog saving={savingUnsavedChanges} onCancel={() => settleUnsavedPrompt(false)} onDiscard={discardAndContinue} onSave={() => void saveAndContinue()} />}
    {confirmationDialog}
    </>}
  </aside>
}

function TripSettings({ trip, canEdit, canManage, canDelete, busy, draftName, draftStartDate, dirty, loadSettings, onNameChange, onStartDateChange, onLoadSettingsChange, onSave, onDuplicate, onArchive, onUnarchive, onDelete }: { trip: Trip; canEdit: boolean; canManage: boolean; canDelete: boolean; busy: boolean; draftName: string; draftStartDate: string | null; dirty: boolean; loadSettings: TripLoadSettings; onNameChange: (value: string) => void; onStartDateChange: (value: string | null) => void; onLoadSettingsChange: (settings: TripLoadSettings) => void; onSave: () => void; onDuplicate: () => void; onArchive: () => void; onUnarchive: () => void; onDelete: () => void }) {
  const archived = trip.status === 'completed' || trip.status === 'archived'
  return <section className="trip-panel-section trip-panel-settings" aria-labelledby="trip-settings-title"><header className="trip-panel-settings__header"><span id="trip-settings-title">Paramètres de la sortie</span></header><section className="trip-panel-options"><h3>Nom du voyage</h3><div className="trip-panel-fields"><input aria-label="Nom du voyage" value={draftName} readOnly={!canEdit} onChange={(event) => onNameChange(event.target.value)} /><div className="trip-panel-field-meta"><span className={dirty ? 'dirty' : ''}>{dirty ? 'Non enregistré' : 'Enregistré'}</span></div></div></section><section className="trip-settings-dates" aria-label="Dates du voyage"><h3>Dates du voyage</h3><div><label><CalendarDays aria-hidden="true" size={16} /><span><small>Date de départ</small>{canEdit ? <input aria-label="Date de départ du voyage" type="date" value={draftStartDate ?? ''} disabled={busy} onChange={(event) => onStartDateChange(event.target.value || null)} /> : <strong>{formatTripDate(trip.start_date)}</strong>}</span></label><div><Flag aria-hidden="true" size={16} /><span><small>Date d’arrivée</small><strong>{formatTripDate(trip.end_date)}</strong></span></div></div></section><TripLoadSettingsForm trip={trip} canEdit={canEdit} busy={busy} value={loadSettings} onChange={onLoadSettingsChange} embedded />{canManage && <section className="trip-settings-controls" aria-label="Contrôles de la sortie"><h3>Contrôles de la sortie</h3><div><button type="button" aria-label="Dupliquer le voyage" disabled={busy} onClick={onDuplicate}><Copy size={14} />Dupliquer</button>{archived ? <button className="trip-settings-control--reactivate" type="button" aria-label="Réactiver la sortie" disabled={busy} onClick={onUnarchive}><ArchiveRestore size={14} />Réactiver</button> : <button type="button" aria-label="Archiver la sortie" disabled={busy} onClick={onArchive}><Archive size={14} />Archiver</button>}{canDelete && <button className="trip-settings-control--danger" type="button" aria-label="Supprimer le voyage" disabled={busy} onClick={onDelete}><Trash2 size={14} />Supprimer</button>}{canEdit && <button className="trip-settings-control--save" type="button" aria-label="Enregistrer" disabled={busy || !dirty || loadSettings.low_load_max_minutes >= loadSettings.medium_load_max_minutes} onClick={onSave}><Save size={14} />Enregistrer</button>}</div></section>}</section>
}

function sameLoadSettings(left: TripLoadSettings, right: TripLoadSettings) {
  return left.low_load_max_minutes === right.low_load_max_minutes
    && left.medium_load_max_minutes === right.medium_load_max_minutes
    && left.low_load_color === right.low_load_color
    && left.medium_load_color === right.medium_load_color
    && left.high_load_color === right.high_load_color
}

function TripSummaryMetrics({ summary, preview = false }: { summary: TripSummary; preview?: boolean }) {
  return <section className="trip-summary-shell">
    <div className={`trip-summary-primary${preview ? ' trip-summary-primary--preview' : ''}`} aria-label="Chiffres clés du voyage">
      <div><Road aria-hidden="true" size={24} /><span><strong>{formatRouteDistance(summary.total_route_distance_meters)}</strong><small>Distance totale</small></span></div>
      <div><Navigation aria-hidden="true" size={24} /><span><strong>{formatMinutes(summary.total_route_duration_minutes)}</strong><small>Temps de trajet</small></span></div>
      <div><Clock3 aria-hidden="true" size={24} /><span><strong>{formatMinutes(summary.total_planned_duration_minutes)}</strong><small>Temps total</small></span></div>
      {preview && <div><Timer aria-hidden="true" size={24} /><span><strong>{formatMinutes(summary.total_visit_duration_minutes)}</strong><small>Temps de visite</small></span></div>}
    </div>
    {!preview && <details className="trip-metrics trip-metrics-global">
      <summary aria-label="Afficher plus d’informations sur le voyage"><small>Afficher plus d’infos</small><ChevronDown className="trip-panel-chevron" size={15} /></summary>
      <div className="trip-metrics__body" aria-label="Informations détaillées du voyage"><div className="trip-metrics-group"><strong>Trajet total</strong><dl><Metric label="Distance totale de route" value={formatRouteDistance(summary.total_route_distance_meters)} /><Metric label="Temps total de conduite" value={formatMinutes(summary.total_route_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Durée planifiée</strong><dl><Metric label="Visites" value={formatMinutes(summary.total_visit_duration_minutes)} /><Metric label="Temps tampon" value={formatMinutes(summary.total_buffer_duration_minutes)} /><Metric label="Marges de sécurité" value={formatMinutes(summary.total_safety_margin_minutes)} /><Metric label="Durée totale estimée" value={formatMinutes(summary.total_planned_duration_minutes)} /></dl></div><div className="trip-metrics-group"><strong>Charge des journées</strong><dl><Metric label="Légères" value={String(summary.low_load_days)} /><Metric label="Moyennes" value={String(summary.medium_load_days)} /><Metric label="Élevées" value={String(summary.high_load_days)} /></dl></div>{!summary.is_time_summary_complete && <p className="trip-metrics-warning" role="status">Résumé partiel : {summary.days_with_incomplete_time_summary} {summary.days_with_incomplete_time_summary > 1 ? 'journées sans planification complète' : 'journée sans planification complète'}.</p>}</div>
    </details>}
  </section>
}

interface TripPreviewTimelineProps {
  trip: Trip
  activeDayId: string | null
  selectedKey: string | null
  daySummaries: Record<string, TripDayTimeSummary>
  onSelectDay: (day: TripDay) => void
  onSelectNight: (night: Trip['nights'][number]) => void
  onSelectLocation: (key: string, dayId: string, stopId: string | null) => void
  onNavigateItem: (key: string, stopId: string | null) => void
}

function routeSegmentBetweenStops(trip: Trip, day: TripDay, dayIndex: number, stopIndex: number) {
  const segments = day.route_segments ?? []
  const fromStop = day.stops[stopIndex]
  const toStop = day.stops[stopIndex + 1]
  if (!fromStop || !toStop) return null
  const labeledSegment = segments.find((segment) => segment.from === `stop:${fromStop.id}` && segment.to === `stop:${toStop.id}`)
  if (labeledSegment) return labeledSegment
  const hasStartAnchor = dayIndex === 0
    ? trip.departure !== null
    : trip.nights.some((night) => night.next_day_id === day.id) || (trip.days[dayIndex - 1]?.stops.length ?? 0) > 0
  return segments[stopIndex + Number(hasStartAnchor)] ?? null
}

function routeSegmentFromStopToNight(day: TripDay, stopIndex: number, nightId: string) {
  const segments = day.route_segments ?? []
  const fromStop = day.stops[stopIndex]
  if (!fromStop || stopIndex !== day.stops.length - 1) return null
  const labeledSegment = segments.find((segment) => segment.from === `stop:${fromStop.id}` && segment.to === `night:${nightId}`)
  if (labeledSegment) return labeledSegment
  return segments.some((segment) => segment.from !== undefined || segment.to !== undefined) ? null : segments.at(-1) ?? null
}

function routeSegmentFromNightToStop(day: TripDay, nightId: string, stopId: string) {
  const segments = day.route_segments ?? []
  const labeledSegment = segments.find((segment) => segment.from === `night:${nightId}` && segment.to === `stop:${stopId}`)
  if (labeledSegment) return labeledSegment
  return segments.some((segment) => segment.from !== undefined || segment.to !== undefined) ? null : segments[0] ?? null
}

function routeSegmentFromDepartureToStop(day: TripDay, departureId: string, stopId: string) {
  const segments = day.route_segments ?? []
  const labeledSegment = segments.find((segment) => segment.from === `departure:${departureId}` && segment.to === `stop:${stopId}`)
  if (labeledSegment) return labeledSegment
  return segments.some((segment) => segment.from !== undefined || segment.to !== undefined) ? null : segments[0] ?? null
}

function routeSegmentFromStopToArrival(day: TripDay, stopIndex: number, arrivalId: string) {
  const segments = day.route_segments ?? []
  const fromStop = day.stops[stopIndex]
  if (!fromStop || stopIndex !== day.stops.length - 1) return null
  const labeledSegment = segments.find((segment) => segment.from === `stop:${fromStop.id}` && segment.to === `arrival:${arrivalId}`)
  if (labeledSegment) return labeledSegment
  return segments.some((segment) => segment.from !== undefined || segment.to !== undefined) ? null : segments.at(-1) ?? null
}

function TripPreviewTimeline({ trip, activeDayId, selectedKey, daySummaries, onSelectDay, onSelectNight, onSelectLocation, onNavigateItem }: TripPreviewTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0, dragged: false })
  const dragSelectionFrameRef = useRef<number | null>(null)
  const dragSelectionIndexRef = useRef(-1)
  const dragSettleTimerRef = useRef<number | null>(null)
  const alignmentFrameRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelResetTimerRef = useRef<number | null>(null)
  const wheelUnlockTimerRef = useRef<number | null>(null)
  const firstDay = trip.days[0]
  const lastDay = trip.days.at(-1)
  const effectiveArrival = trip.arrival ?? trip.departure
  const arrivalTime = lastDay ? formatClock(daySummaries[lastDay.id]?.estimated_arrival_time ?? null, daySummaries[lastDay.id]?.estimated_arrival_day_offset ?? null) : '—'
  const navigationItems = useMemo(() => {
    const items: Array<{ key: string; stopId: string | null }> = []
    if (trip.departure) items.push({ key: 'departure', stopId: null })
    trip.days.forEach((day, dayIndex) => {
      day.stops.forEach((stop) => items.push({ key: `stop:${stop.id}`, stopId: stop.id }))
      const night = trip.nights.find((item) => item.previous_day_id === day.id)
      if (night) items.push({ key: `night:${night.id}`, stopId: null })
      if (dayIndex === trip.days.length - 1 && effectiveArrival) items.push({ key: 'arrival', stopId: null })
    })
    return items
  }, [effectiveArrival, trip.days, trip.departure, trip.nights])
  const selectedNavigationIndex = navigationItems.findIndex((item) => item.key === selectedKey)
  const selectedDayId = selectedKey?.startsWith('day:') ? selectedKey.slice(4) : selectedKey === null ? activeDayId : null
  const selectedPointColor = useMemo(() => {
    const fallbackDay = trip.days.find((day) => day.id === activeDayId) ?? firstDay
    if (!selectedKey) return fallbackDay?.color ?? '#0FA68A'
    if (selectedKey === 'departure') return firstDay?.color ?? '#0FA68A'
    if (selectedKey === 'arrival') return lastDay?.color ?? '#0FA68A'
    if (selectedKey.startsWith('day:')) return trip.days.find((day) => `day:${day.id}` === selectedKey)?.color ?? '#0FA68A'
    if (selectedKey.startsWith('stop:')) return trip.days.find((day) => day.stops.some((stop) => `stop:${stop.id}` === selectedKey))?.color ?? '#0FA68A'
    const night = trip.nights.find((item) => `night:${item.id}` === selectedKey)
    return trip.days.find((day) => day.id === night?.next_day_id)?.color ?? fallbackDay?.color ?? '#0FA68A'
  }, [activeDayId, firstDay, lastDay, selectedKey, trip.days, trip.nights])
  const selectedLeg = useMemo(() => {
    if (!selectedKey) return null
    if (selectedKey === 'departure') {
      const day = trip.days[0]
      const target = day?.stops[0]
      if (!day || !trip.departure || !target) return null
      return { from: trip.departure.name, to: target.name, color: day.color ?? '#0FA68A', segment: routeSegmentFromDepartureToStop(day, trip.departure.id, target.id) }
    }
    if (selectedKey.startsWith('night:')) {
      const night = trip.nights.find((item) => `night:${item.id}` === selectedKey)
      const day = night ? trip.days.find((item) => item.id === night.next_day_id) : null
      const target = day?.stops[0]
      if (!night || !day || !target) return null
      return { from: night.name, to: target.name, color: day.color ?? '#0FA68A', segment: routeSegmentFromNightToStop(day, night.id, target.id) }
    }
    if (!selectedKey.startsWith('stop:')) return null
    const dayIndex = trip.days.findIndex((day) => day.stops.some((stop) => `stop:${stop.id}` === selectedKey))
    const day = trip.days[dayIndex]
    const stopIndex = day?.stops.findIndex((stop) => `stop:${stop.id}` === selectedKey) ?? -1
    const stop = day?.stops[stopIndex]
    if (!day || !stop || stopIndex < 0) return null
    const nextStop = day.stops[stopIndex + 1]
    const nextNight = stopIndex === day.stops.length - 1 ? trip.nights.find((night) => night.previous_day_id === day.id) : null
    const nextArrival = stopIndex === day.stops.length - 1 && dayIndex === trip.days.length - 1 && !nextNight ? effectiveArrival : null
    const target = nextStop ?? nextNight ?? nextArrival
    if (!target) return null
    const segment = nextStop
      ? routeSegmentBetweenStops(trip, day, dayIndex, stopIndex)
      : nextNight
        ? routeSegmentFromStopToNight(day, stopIndex, nextNight.id)
        : nextArrival
          ? routeSegmentFromStopToArrival(day, stopIndex, nextArrival.id)
          : null
    return { from: stop.name, to: target.name, color: day.color ?? '#0FA68A', segment }
  }, [effectiveArrival, selectedKey, trip])
  const getTimelinePointBounds = useCallback((item: HTMLElement) => {
    const point = item.querySelector<HTMLElement>('.trip-preview-anchor-dot') ?? item.querySelector<HTMLElement>(':scope > span')
    const pointBounds = point?.getBoundingClientRect()
    return pointBounds && (pointBounds.width > 0 || pointBounds.height > 0) ? pointBounds : item.getBoundingClientRect()
  }, [])
  const centerTimelineElement = useCallback((item: HTMLElement, behavior: 'smooth' | 'instant' = 'smooth') => {
    const viewport = trackRef.current
    if (!viewport || dragStateRef.current.pointerId !== -1) return
    const viewportBounds = viewport.getBoundingClientRect()
    const itemBounds = getTimelinePointBounds(item)
    const centerGuideBounds = viewport.closest('.trip-preview-timeline')?.querySelector<HTMLElement>('.trip-preview-center-guide')?.getBoundingClientRect()
    const centerAxisX = centerGuideBounds ? centerGuideBounds.left + centerGuideBounds.width / 2 : viewportBounds.left + viewportBounds.width / 2
    const left = Math.max(0, viewport.scrollLeft + itemBounds.left + itemBounds.width / 2 - centerAxisX)
    if (behavior === 'smooth' && typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, behavior: 'smooth' })
    else viewport.scrollLeft = left
  }, [getTimelinePointBounds])
  const lockTimelineElementToGuide = useCallback((item: HTMLElement) => {
    if (alignmentFrameRef.current !== null) cancelAnimationFrame(alignmentFrameRef.current)
    let remainingCorrections = 2
    const correctAlignment = () => {
      const viewport = trackRef.current
      if (!viewport || dragStateRef.current.pointerId !== -1) { alignmentFrameRef.current = null; return }
      const pointBounds = getTimelinePointBounds(item)
      const guideBounds = viewport.closest('.trip-preview-timeline')?.querySelector<HTMLElement>('.trip-preview-center-guide')?.getBoundingClientRect()
      const viewportBounds = viewport.getBoundingClientRect()
      const guideCenter = guideBounds ? guideBounds.left + guideBounds.width / 2 : viewportBounds.left + viewportBounds.width / 2
      const pointCenter = pointBounds.left + pointBounds.width / 2
      const error = pointCenter - guideCenter
      if (Math.abs(error) > 0.25) viewport.scrollLeft += error
      remainingCorrections -= 1
      if (Math.abs(error) <= 0.25 || remainingCorrections <= 0) { alignmentFrameRef.current = null; return }
      alignmentFrameRef.current = requestAnimationFrame(correctAlignment)
    }
    correctAlignment()
  }, [getTimelinePointBounds])
  const findSelectedTimelineElement = useCallback(() => {
    const viewport = trackRef.current
    if (!viewport) return null
    if (selectedNavigationIndex >= 0) return viewport.querySelector<HTMLElement>(`[data-preview-navigation-index="${selectedNavigationIndex}"]`)
    if (!selectedDayId) return null
    return Array.from(viewport.querySelectorAll<HTMLElement>('[data-preview-day-id]')).find((item) => item.dataset.previewDayId === selectedDayId) ?? null
  }, [selectedDayId, selectedNavigationIndex])
  const centerSelectedTimelineElement = useCallback((behavior: 'smooth' | 'instant' = 'smooth') => {
    const item = findSelectedTimelineElement()
    if (item) centerTimelineElement(item, behavior)
  }, [centerTimelineElement, findSelectedTimelineElement])
  const selectTimelineItemNearestCenter = useCallback(() => {
    const viewport = trackRef.current
    if (!viewport) return null
    const viewportBounds = viewport.getBoundingClientRect()
    const centerGuideBounds = viewport.closest('.trip-preview-timeline')?.querySelector<HTMLElement>('.trip-preview-center-guide')?.getBoundingClientRect()
    const centerAxisX = centerGuideBounds ? centerGuideBounds.left + centerGuideBounds.width / 2 : viewportBounds.left + viewportBounds.width / 2
    const candidates = Array.from(viewport.querySelectorAll<HTMLElement>('[data-preview-navigation-index]'))
      .map((element) => ({ element, index: Number(element.dataset.previewNavigationIndex), bounds: getTimelinePointBounds(element) }))
      .filter((item) => Number.isInteger(item.index) && item.index >= 0 && (item.bounds.width > 0 || item.bounds.height > 0))
    const closest = candidates.reduce<(typeof candidates)[number] | null>((current, candidate) => {
      const distance = Math.abs(candidate.bounds.left + candidate.bounds.width / 2 - centerAxisX)
      if (!current) return candidate
      const currentDistance = Math.abs(current.bounds.left + current.bounds.width / 2 - centerAxisX)
      return distance < currentDistance ? candidate : current
    }, null)
    if (!closest) return null
    if (closest.index !== dragSelectionIndexRef.current) {
      dragSelectionIndexRef.current = closest.index
      const item = navigationItems[closest.index]
      if (item) onNavigateItem(item.key, item.stopId)
    }
    return closest.element
  }, [getTimelinePointBounds, navigationItems, onNavigateItem])
  const startTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = trackRef.current
    if (!viewport || event.button !== 0 || event.isPrimary === false) return
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
    if (dragSettleTimerRef.current !== null) window.clearTimeout(dragSettleTimerRef.current)
    suppressClickRef.current = false
    dragSelectionIndexRef.current = selectedNavigationIndex
    dragStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: viewport.scrollLeft, dragged: false }
  }
  const moveTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = trackRef.current
    const drag = dragStateRef.current
    if (!viewport || drag.pointerId !== event.pointerId) return
    const delta = event.clientX - drag.startX
    if (!drag.dragged && Math.abs(delta) < 5) return
    if (!drag.dragged) {
      drag.dragged = true
      viewport.setPointerCapture?.(event.pointerId)
    }
    viewport.classList.add('is-dragging')
    viewport.scrollLeft = drag.startScrollLeft - delta
    if (dragSelectionFrameRef.current !== null) cancelAnimationFrame(dragSelectionFrameRef.current)
    dragSelectionFrameRef.current = requestAnimationFrame(() => {
      dragSelectionFrameRef.current = null
      selectTimelineItemNearestCenter()
    })
    event.preventDefault()
  }
  const finishTimelineDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const viewport = trackRef.current
    const drag = dragStateRef.current
    if (!viewport || drag.pointerId !== event.pointerId) return
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    viewport.classList.remove('is-dragging')
    suppressClickRef.current = drag.dragged && !cancelled
    dragStateRef.current = { pointerId: -1, startX: 0, startScrollLeft: viewport.scrollLeft, dragged: false }
    if (dragSelectionFrameRef.current !== null) cancelAnimationFrame(dragSelectionFrameRef.current)
    dragSelectionFrameRef.current = null
    if (suppressClickRef.current) requestAnimationFrame(() => {
      const centeredItem = selectTimelineItemNearestCenter()
      if (centeredItem) {
        centerTimelineElement(centeredItem)
        dragSettleTimerRef.current = window.setTimeout(() => {
          lockTimelineElementToGuide(centeredItem)
          dragSettleTimerRef.current = null
        }, 180)
      }
    })
    if (suppressClickRef.current) suppressClickTimerRef.current = window.setTimeout(() => { suppressClickRef.current = false; suppressClickTimerRef.current = null }, 0)
  }
  const navigateTimeline = useCallback((direction: -1 | 1) => {
    if (navigationItems.length === 0) return
    const nextIndex = selectedNavigationIndex < 0
      ? (direction === 1 ? 0 : navigationItems.length - 1)
      : Math.min(navigationItems.length - 1, Math.max(0, selectedNavigationIndex + direction))
    if (nextIndex === selectedNavigationIndex) return
    const item = navigationItems[nextIndex]
    onNavigateItem(item.key, item.stopId)
  }, [navigationItems, onNavigateItem, selectedNavigationIndex])
  const navigateTimelineWithWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0 || navigationItems.length === 0) return
    event.preventDefault()
    if (wheelUnlockTimerRef.current !== null) return
    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, trackRef.current?.clientWidth ?? 1) : 1
    wheelDeltaRef.current += event.deltaY * deltaUnit
    if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelDeltaRef.current = 0
      wheelResetTimerRef.current = null
    }, 160)
    if (Math.abs(wheelDeltaRef.current) < 32) return
    const direction = wheelDeltaRef.current < 0 ? -1 : 1
    wheelDeltaRef.current = 0
    navigateTimeline(direction)
    wheelUnlockTimerRef.current = window.setTimeout(() => { wheelUnlockTimerRef.current = null }, 140)
  }, [navigateTimeline, navigationItems.length])
  useEffect(() => {
    if (!findSelectedTimelineElement()) return
    const frame = requestAnimationFrame(() => centerSelectedTimelineElement())
    const settleTimer = window.setTimeout(() => {
      const item = findSelectedTimelineElement()
      if (item) lockTimelineElementToGuide(item)
    }, 180)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
    }
  }, [centerSelectedTimelineElement, findSelectedTimelineElement, lockTimelineElementToGuide])
  useEffect(() => {
    const viewport = trackRef.current
    const selectedItem = findSelectedTimelineElement()
    if (!viewport || !selectedItem || typeof ResizeObserver === 'undefined') return
    let frame: number | null = null
    const observer = new ResizeObserver(() => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const item = findSelectedTimelineElement()
        if (item) lockTimelineElementToGuide(item)
      })
    })
    observer.observe(viewport)
    const track = viewport.querySelector<HTMLElement>('.trip-preview-track')
    if (track) observer.observe(track)
    const centerGuide = viewport.closest('.trip-preview-timeline')?.querySelector<HTMLElement>('.trip-preview-center-guide')
    if (centerGuide) observer.observe(centerGuide)
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [findSelectedTimelineElement, lockTimelineElementToGuide])
  useEffect(() => {
    const navigateWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return
      event.preventDefault()
      navigateTimeline(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', navigateWithKeyboard)
    return () => window.removeEventListener('keydown', navigateWithKeyboard)
  }, [navigateTimeline])
  useEffect(() => () => {
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
    if (dragSelectionFrameRef.current !== null) cancelAnimationFrame(dragSelectionFrameRef.current)
    if (dragSettleTimerRef.current !== null) window.clearTimeout(dragSettleTimerRef.current)
    if (alignmentFrameRef.current !== null) cancelAnimationFrame(alignmentFrameRef.current)
    if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
    if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current)
  }, [])

  return <section className="trip-preview-timeline" aria-labelledby="trip-preview-timeline-title">
    <h3 id="trip-preview-timeline-title" className="visually-hidden">Frise interactive du voyage</h3>
    <span className="trip-preview-center-guide" style={{ color: selectedPointColor }} aria-hidden="true"><ChevronDown size={20} /><ChevronUp size={20} /></span>
    <div ref={trackRef} className="trip-preview-viewport" onWheel={navigateTimelineWithWheel} onPointerDown={startTimelineDrag} onPointerMove={moveTimelineDrag} onPointerUp={(event) => finishTimelineDrag(event)} onPointerCancel={(event) => finishTimelineDrag(event, true)} onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current); suppressClickTimerRef.current = null } }}><ol className="trip-preview-track">
      {firstDay && <li className="trip-preview-anchor-item">
        <button className={`trip-preview-anchor trip-preview-anchor--terminal${selectedKey === 'departure' ? ' is-selected' : ''}${selectedKey === 'departure' && firstDay.stops[0] ? ' has-active-connector' : ''}`} style={{ '--trip-preview-color': firstDay.color ?? '#0FA68A' } as CSSProperties} type="button" data-preview-navigation-index={navigationItems.findIndex((item) => item.key === 'departure')} aria-label={`Départ${trip.departure ? ` : ${trip.departure.name}` : ''}`} aria-current={selectedKey === 'departure' ? 'step' : undefined} disabled={!trip.departure} onClick={() => { if (trip.departure) onSelectLocation('departure', firstDay.id, null) }}>
          <strong>Départ</strong><span className="trip-preview-anchor-dot"><Play size={14} /></span><small>{trip.departure?.name ?? 'Non défini'}</small><em>{formatClock(trip.departure?.departure_time ?? null)}</em>
        </button>
      </li>}
      {trip.days.map((day, dayIndex) => {
        const night = trip.nights.find((item) => item.previous_day_id === day.id)
        const nextDay = trip.days[dayIndex + 1]
        const dayColor = day.color ?? '#0FA68A'
        const nextDayColor = nextDay?.color ?? dayColor
        const daySelected = selectedKey === `day:${day.id}` || (selectedKey === null && activeDayId === day.id)
        const containsSelectedStop = day.stops.some((stop) => selectedKey === `stop:${stop.id}`)
        return <Fragment key={day.id}>
          <li className={`trip-preview-day-group${daySelected || containsSelectedStop ? ' is-active' : ''}`} data-preview-day-id={day.id} style={{ '--trip-preview-color': dayColor, '--trip-preview-next-color': nextDayColor } as CSSProperties}>
            <button className="trip-preview-day-zone" type="button" aria-label={`Jour ${day.day_number}`} aria-pressed={daySelected} title={`Afficher le tracé du jour ${day.day_number}`} onClick={() => onSelectDay(day)} />
            <span className="trip-preview-stop-segment" aria-label={`Étapes du jour ${day.day_number}`}>
              {day.stops.map((stop, stopIndex) => {
                const stopKey = `stop:${stop.id}`
                const stopSelected = selectedKey === stopKey
                const nextStop = day.stops[stopIndex + 1]
                const nextNight = stopIndex === day.stops.length - 1 ? night : null
                const nextArrival = stopIndex === day.stops.length - 1 && dayIndex === trip.days.length - 1 && !nextNight ? effectiveArrival : null
                const routeTarget = nextStop ?? nextNight ?? nextArrival
                return <Fragment key={stop.id}>
                  <button className={`trip-preview-stop${stopSelected ? ' is-selected' : ''}${stopSelected && routeTarget ? ' has-active-connector' : ''}`} style={{ '--trip-preview-color': dayColor } as CSSProperties} type="button" data-preview-navigation-index={navigationItems.findIndex((item) => item.key === stopKey)} aria-label={`Étape ${stopIndex + 1} : ${stop.name}`} aria-current={stopSelected ? 'step' : undefined} onClick={() => onSelectLocation(stopKey, day.id, stop.id)}><span aria-hidden="true" /></button>
                </Fragment>
              })}
            </span>
            <span className="trip-preview-day-label" aria-hidden="true">Jour {day.day_number}</span>
          </li>
          {night && <li className="trip-preview-anchor-item"><button className={`trip-preview-anchor trip-preview-anchor--night${selectedKey === `night:${night.id}` ? ' is-selected' : ''}${selectedKey === `night:${night.id}` && nextDay?.stops[0] ? ' has-active-connector' : ''}`} style={{ '--trip-preview-color': nextDayColor, '--trip-preview-night-previous-color': dayColor, '--trip-preview-night-next-color': nextDayColor } as CSSProperties} type="button" data-preview-navigation-index={navigationItems.findIndex((item) => item.key === `night:${night.id}`)} aria-label={`Nuit ${dayIndex + 1} : ${night.name}`} aria-current={selectedKey === `night:${night.id}` ? 'step' : undefined} onClick={() => onSelectNight(night)}>
            <strong>Nuit {dayIndex + 1}</strong><span className="trip-preview-anchor-dot"><Moon size={14} /></span><small aria-hidden="true" />{(night.check_in_from_time ?? night.check_in_time) && <em>{formatClock(night.check_in_from_time ?? night.check_in_time!)}</em>}
          </button></li>}
        </Fragment>
      })}
      {lastDay && <li className="trip-preview-anchor-item">
        <button className={`trip-preview-anchor trip-preview-anchor--terminal${selectedKey === 'arrival' ? ' is-selected' : ''}`} type="button" data-preview-navigation-index={navigationItems.findIndex((item) => item.key === 'arrival')} aria-label={`Arrivée${effectiveArrival ? ` : ${effectiveArrival.name}` : ''}`} aria-current={selectedKey === 'arrival' ? 'step' : undefined} disabled={!effectiveArrival} onClick={() => { if (effectiveArrival) onSelectLocation('arrival', lastDay.id, null) }}>
          <strong>Arrivée</strong><span className="trip-preview-anchor-dot"><Flag size={14} /></span><small>{effectiveArrival?.name ?? 'Non définie'}</small><em>{arrivalTime}</em>
        </button>
      </li>}
    </ol></div>
    {selectedLeg && <div className="trip-preview-leg-card" style={{ '--trip-preview-color': selectedLeg.color } as CSSProperties} role="status" aria-label={`${selectedLeg.from} vers ${selectedLeg.to} : ${formatRouteDistance(selectedLeg.segment?.distance_meters ?? null)}, ${formatRouteDuration(selectedLeg.segment?.duration_seconds ?? null)}`}><span><small>Départ</small><strong title={selectedLeg.from}>{selectedLeg.from}</strong></span><ChevronRight className="trip-preview-leg-card__separator" aria-hidden="true" size={16} /><span className="trip-preview-leg-card__metrics"><span className="trip-preview-leg-card__metric-values"><span><Road aria-hidden="true" size={16} />{formatRouteDistance(selectedLeg.segment?.distance_meters ?? null)}</span><i aria-hidden="true" /><span><Clock3 aria-hidden="true" size={16} />{formatRouteDuration(selectedLeg.segment?.duration_seconds ?? null)}</span></span></span><ChevronRight className="trip-preview-leg-card__separator" aria-hidden="true" size={16} /><span><small>Arrivée</small><strong title={selectedLeg.to}>{selectedLeg.to}</strong></span></div>}
  </section>
}

function formatTripDate(value: string | null) {
  if (!value) return 'À définir'
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}

function DayHeaderMetrics({ summary, status }: { summary: TripDayTimeSummary | undefined; status: TimelineStatus }) {
  const loadLabels: Record<Exclude<TripDayTimeSummary['load_level'], 'unavailable'>, string> = { low: 'Faible', medium: 'Modérée', high: 'Élevée' }
  const loadStyle = summary?.load_color ? { '--trip-load-color': summary.load_color } as CSSProperties : undefined
  return <span className="trip-day-header-metrics" aria-label="Résumé de la journée">
    <span className="trip-day-header-metric"><strong><Road aria-hidden="true" size={12} />{formatRouteDistance(summary?.route_distance_meters ?? null)}</strong><small>Distance</small></span>
    <span className="trip-day-header-metric"><strong><Car aria-hidden="true" size={12} />{formatMinutes(summary?.route_duration_minutes ?? null)}</strong><small>Route</small></span>
    <span className="trip-day-header-metric"><strong><Clock3 aria-hidden="true" size={12} />{formatMinutes(summary?.total_duration_minutes ?? null)}</strong><small>Total</small></span>
    <span className="trip-day-header-status"><TimelineStatusBadge status={status} /></span>
    {summary && summary.load_level !== 'unavailable' && <span className="trip-day-header-load"><span className="trip-day-load-label" style={loadStyle}><Gauge aria-hidden="true" size={12} /><strong>{loadLabels[summary.load_level]}</strong></span></span>}
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
function downloadFile(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000)
}
function TripExportMenu({ onGpx, onPdf }: { onGpx: () => void; onPdf: (trigger: HTMLButtonElement) => void }) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  return <details ref={menuRef} className="trip-export-menu"><summary className="panel-icon-button" aria-label="Exporter la sortie" title="Exporter la sortie"><Download size={16} /></summary><div role="menu" aria-label="Options d’export"><button type="button" role="menuitem" onClick={(event) => { menuRef.current?.removeAttribute('open'); onPdf(event.currentTarget) }}><Download size={14} />Exporter en PDF</button><button type="button" role="menuitem" onClick={() => { menuRef.current?.removeAttribute('open'); onGpx() }}><Download size={14} />Exporter en GPX</button></div></details>
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

function DayVisibilityBubble({ day, hidden, onChange }: { day: TripDay; hidden: boolean; onChange: (visible: boolean) => void }) {
  const hasMapContent = day.stops.length > 0 || Boolean(day.route_geometry?.coordinates.length)
  const visible = hasMapContent && !hidden
  const label = !hasMapContent ? `Jour ${day.day_number} sans contenu cartographique` : `${hidden ? 'Afficher' : 'Masquer'} le jour ${day.day_number} sur la carte`
  return <button className="trip-panel-day-number trip-day-visibility-bubble" type="button" role="switch" aria-checked={visible} aria-label={label} title={label} disabled={!hasMapContent} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(hidden) }}><span className="trip-day-bubble__default" aria-hidden="true"><Sun size={12} /><b>J{day.day_number}</b></span><span className="trip-day-bubble__visibility" aria-hidden="true">{visible ? <Eye size={15} /> : <EyeOff size={15} />}</span></button>
}

function DayCollapseToggle({ day }: { day: TripDay }) {
  const dayCollapse = useContext(DayCollapseContext)
  if (!dayCollapse) return null
  const collapsed = dayCollapse?.collapsedDayIds.has(day.id) ?? false
  return <button className="trip-day-collapse-toggle trip-day-collapse-toggle--inline" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} le jour ${day.day_number}`} aria-expanded={!collapsed} onClick={(event) => { event.preventDefault(); event.stopPropagation(); dayCollapse.onToggle(day.id) }}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
}

type TimelineCollapseRequest = { collapsed: boolean; version: number }

function useTransientDropState() {
  const [dropActive, setDropActive] = useState(false)
  useEffect(() => {
    const clearDropState = () => setDropActive(false)
    window.addEventListener('dragend', clearDropState)
    window.addEventListener('drop', clearDropState)
    return () => {
      window.removeEventListener('dragend', clearDropState)
      window.removeEventListener('drop', clearDropState)
    }
  }, [])
  return [dropActive, setDropActive] as const
}

function draggedPlaceId(dataTransfer: DataTransfer) {
  const cartavaultPlaceId = dataTransfer.getData('application/x-cartavault-place')
  if (cartavaultPlaceId) return cartavaultPlaceId.startsWith('place:') ? cartavaultPlaceId.slice(6) : cartavaultPlaceId
  const fallback = dataTransfer.getData('text/plain')
  return fallback.startsWith('place:') ? fallback.slice(6) : null
}

function hasDraggedPlace(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes('application/x-cartavault-place') || dataTransfer.types.includes('text/plain')
}

function useTripUndo(trip: Trip, reload: (id?: string) => Promise<void>) {
  return useCallback(async (label: string, action: () => Promise<void>) => {
    const before = await getTrip(trip.id)
    await action()
    const after = await getTrip(trip.id)
    const restore = async (state: Trip) => { await restoreTripState(trip.id, state); await reload(trip.id) }
    recordReversibleAction({ label, undo: () => restore(before), redo: () => restore(after) })
  }, [reload, trip.id])
}

function Departure({ trip, selected, recommendedStart, recommendedStartOffset, collapseRequest, onSelect, onStopFocus, onStopPlaceSelect }: { trip: Trip; selected: boolean; recommendedStart: string | null; recommendedStartOffset: number | null; collapseRequest: TimelineCollapseRequest; onSelect: () => void; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect: (placeId: string) => void }) {
  const anchorActions = useContext(TripAnchorActionsContext)
  const [collapsed, setCollapsed] = useState(false)
  const [dropActive, setDropActive] = useTransientDropState()
  const departure = trip.departure
  const reload = anchorActions?.reload ?? (async () => undefined)
  const runUndoable = useTripUndo(trip, reload)
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  const focusDeparture = () => {
    onSelect()
    if (!departure) return
    onStopFocus?.(departure.latitude, departure.longitude)
    if (departure.place_id) onStopPlaceSelect(departure.place_id)
    else anchorActions?.onOpenPopup('departure')
  }
  const dropDeparture = (event: DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    if (!anchorActions?.canEdit) return
    const placeId = draggedPlaceId(event.dataTransfer)
    if (!placeId) return
    if (anchorActions.onPlaceDrop) {
      void anchorActions.onPlaceDrop('departure', placeId)
      return
    }
    void runUndoable(departure ? 'remplacement du point de départ' : 'ajout du point de départ', async () => {
      const payload = { place_id: placeId, notes: departure?.notes ?? null, departure_time: departure?.departure_time ?? null }
      if (departure) await updateTripDeparture(departure.id, payload)
      else await addTripDeparture(trip.id, payload)
      await anchorActions.reload(trip.id)
    })
  }
  const removeDeparture = (event: ReactMouseEvent) => {
    event.stopPropagation()
    if (!departure || !anchorActions?.canEdit) return
    void runUndoable('suppression du point de départ', async () => { await deleteTripDeparture(departure.id); await anchorActions.reload(trip.id) })
  }

  return <>
    <div
      className={`trip-panel-night trip-panel-departure${departure ? '' : ' is-empty'}${anchorActions?.canEdit ? ' drop-enabled' : ''}${selected ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      onDragEnter={(event) => { if (anchorActions?.canEdit && hasDraggedPlace(event.dataTransfer)) { event.preventDefault(); setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
      onDragOver={(event) => { if (anchorActions?.canEdit) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
      onDrop={dropDeparture}
    >
      <span className="trip-timeline-anchor-badge"><Play aria-hidden="true" size={15} /></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row" role="button" tabIndex={0} aria-pressed={selected} aria-label="Sélectionner le départ comme cible d’ajout" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) onSelect() }} onKeyDown={(event) => { if (!(event.target as HTMLElement).closest('button') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } }}>
          <span className="trip-panel-timeline-heading"><strong>Départ</strong></span>
          <span className="trip-day-header-metrics trip-night-header-metrics trip-anchor-header-metrics" aria-label="Résumé du départ">
            <span className="trip-day-header-metric trip-night-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}>
              <strong><Clock3 aria-hidden="true" size={12} />{recommendedLabel}</strong>
              <small>Départ conseillé</small>
            </span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-day-header-status"><TimelineStatusBadge status={departure ? 'valid' : 'empty'} /></span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
          </span>
          <span className="trip-night-header-actions">
            <button className="trip-day-collapse-toggle trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} le départ`} aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (departure
          ? <div className="trip-night-stop" role="button" tabIndex={0} aria-label={departure.place_id ? 'POI' : 'Point cartographique'} onClick={focusDeparture} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusDeparture() } }}>
              <MapPin aria-hidden="true" size={14} />
              <span className="trip-night-stop-copy"><strong>{departure.name}</strong><small>{departure.place_id ? 'POI' : 'Point cartographique'}</small></span>
              {!departure.place_id && <span className="trip-night-stop-actions">
                <a className="trip-night-google-link" href={googleMapsAnchorUrl(departure)} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${departure.name} dans Google Maps`} title="Ouvrir dans Google Maps" onClick={(event) => event.stopPropagation()}><ExternalLink size={11} /></a>
                {anchorActions?.canEdit && <button className="trip-night-remove" type="button" aria-label="Supprimer le point de départ" title="Supprimer le point de départ" onClick={removeDeparture}><Trash2 size={11} /></button>}
              </span>}
            </div>
          : <div className="trip-night-placeholder">
              <span>Sélectionnez le départ puis utilisez la recherche de la carte</span>
            </div>)}
      </div>
    </div>
  </>
}

function Arrival({ trip, selected, estimatedArrival, estimatedArrivalOffset, collapseRequest, onSelect, onStopFocus, onStopPlaceSelect }: { trip: Trip; selected: boolean; estimatedArrival: string | null; estimatedArrivalOffset: number | null; collapseRequest: TimelineCollapseRequest; onSelect: () => void; onStopFocus?: (latitude: number, longitude: number) => void; onStopPlaceSelect: (placeId: string) => void }) {
  const anchorActions = useContext(TripAnchorActionsContext)
  const [collapsed, setCollapsed] = useState(false)
  const [dropActive, setDropActive] = useTransientDropState()
  const arrival = trip.arrival
  const effectiveArrival = arrival ?? trip.departure
  const reload = anchorActions?.reload ?? (async () => undefined)
  const runUndoable = useTripUndo(trip, reload)
  const estimatedArrivalLabel = formatClock(estimatedArrival, estimatedArrivalOffset)
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
  const focusArrival = () => {
    onSelect()
    if (!effectiveArrival) return
    onStopFocus?.(effectiveArrival.latitude, effectiveArrival.longitude)
    if (effectiveArrival.place_id) onStopPlaceSelect(effectiveArrival.place_id)
    else anchorActions?.onOpenPopup(arrival ? 'arrival' : 'departure')
  }
  const dropArrival = (event: DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    if (!anchorActions?.canEdit) return
    const placeId = draggedPlaceId(event.dataTransfer)
    if (!placeId) return
    if (anchorActions.onPlaceDrop) {
      void anchorActions.onPlaceDrop('arrival', placeId)
      return
    }
    void runUndoable(arrival ? 'remplacement du point d’arrivée' : 'ajout du point d’arrivée', async () => {
      const payload = { place_id: placeId, notes: arrival?.notes ?? null }
      if (arrival) await updateTripArrival(arrival.id, payload)
      else await addTripArrival(trip.id, payload)
      await anchorActions.reload(trip.id)
    })
  }
  const removeArrival = (event: ReactMouseEvent) => {
    event.stopPropagation()
    if (!arrival || !anchorActions?.canEdit) return
    void runUndoable('suppression du point d’arrivée', async () => { await deleteTripArrival(arrival.id); await anchorActions.reload(trip.id) })
  }

  return <>
    <div
      className={`trip-panel-night trip-panel-arrival${effectiveArrival ? '' : ' is-empty'}${anchorActions?.canEdit ? ' drop-enabled' : ''}${selected ? ' is-active' : ''}${collapsed ? ' is-collapsed' : ''}${dropActive ? ' is-drop-target' : ''}`}
      onDragEnter={(event) => { if (anchorActions?.canEdit && hasDraggedPlace(event.dataTransfer)) { event.preventDefault(); setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
      onDragOver={(event) => { if (anchorActions?.canEdit) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
      onDrop={dropArrival}
    >
      <span className="trip-timeline-anchor-badge trip-timeline-arrival-badge"><Flag aria-hidden="true" size={14} /></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row" role="button" tabIndex={0} aria-pressed={selected} aria-label="Sélectionner l’arrivée comme cible d’ajout" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) onSelect() }} onKeyDown={(event) => { if (!(event.target as HTMLElement).closest('button') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect() } }}>
          <span className="trip-panel-timeline-heading"><strong>Arrivée</strong></span>
          <span className="trip-day-header-metrics trip-night-header-metrics trip-anchor-header-metrics" aria-label="Résumé de l’arrivée">
            <span className="trip-day-header-metric trip-arrival-estimated" aria-label={`Arrivée estimée : ${estimatedArrivalLabel}`}>
              <strong><Clock3 aria-hidden="true" size={12} />{estimatedArrivalLabel}</strong>
              <small>Arrivée estimée</small>
            </span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-day-header-status"><TimelineStatusBadge status={effectiveArrival ? 'valid' : 'empty'} /></span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
          </span>
          <span className="trip-night-header-actions">
            <button className="trip-day-collapse-toggle trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} l’arrivée`} aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (effectiveArrival
          ? <div className="trip-night-stop" role="button" tabIndex={0} aria-label={arrival ? (arrival.place_id ? 'POI' : 'Point cartographique') : 'Même point que le départ'} onClick={focusArrival} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusArrival() } }}>
              <MapPin aria-hidden="true" size={14} />
              <span className="trip-night-stop-copy"><strong>{effectiveArrival.name}</strong><small>{arrival ? (arrival.place_id ? 'POI' : 'Point cartographique') : 'Même point que le départ'}</small></span>
              {arrival && !arrival.place_id && <span className="trip-night-stop-actions">
                <a className="trip-night-google-link" href={googleMapsAnchorUrl(arrival)} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${arrival.name} dans Google Maps`} title="Ouvrir dans Google Maps" onClick={(event) => event.stopPropagation()}><ExternalLink size={11} /></a>
                {anchorActions?.canEdit && <button className="trip-night-remove" type="button" aria-label="Supprimer le point d’arrivée" title="Supprimer le point d’arrivée" onClick={removeArrival}><Trash2 size={11} /></button>}
              </span>}
            </div>
          : <div className="trip-night-placeholder">
              <span>Sélectionnez l’arrivée puis utilisez la recherche de la carte</span>
            </div>)}
      </div>
    </div>
  </>
}

function Night({ trip, previous, next, recommendedStart, recommendedStartOffset, activeTarget, canEdit, reload, collapseRequest, onSelect, onStopFocus }: { trip: Trip; previous: TripDay; next: TripDay; recommendedStart: string | null; recommendedStartOffset: number | null; activeTarget: TripNightTarget | null; canEdit: boolean; reload: (id?: string) => Promise<void>; collapseRequest: TimelineCollapseRequest; onSelect: (target: TripNightTarget, openPopup?: boolean) => void; onStopFocus?: (latitude: number, longitude: number) => void }) {
  const runUndoable = useTripUndo(trip, reload)
  const night = trip.nights.find((item) => item.previous_day_id === previous.id && item.next_day_id === next.id)
  const [dropError, setDropError] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [dropActive, setDropActive] = useTransientDropState()
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => setCollapsed(collapseRequest.collapsed), [collapseRequest])
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
        await runUndoable(night ? 'modification de la nuit' : 'ajout de la nuit', async () => {
          if (night) await updateTripNight(night.id, { place_id: placeId, source_type: 'place' })
          else await addTripNight(trip.id, { previous_day_id: previous.id, next_day_id: next.id, place_id: placeId, source_type: 'place' })
          await reload(trip.id)
        })
      } catch (caught) {
        setDropError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer cet hébergement.')
      } finally { setDropping(false) }
    })()
  }
  const recommendedLabel = formatClock(recommendedStart, recommendedStartOffset)
  const timelineColors = { '--trip-night-previous-color': previous.color ?? '#0FA68A', '--trip-night-next-color': next.color ?? '#0FA68A' } as CSSProperties
  const selection = { nightId: night?.id ?? null, previousDayId: previous.id, nextDayId: next.id }
  const selected = activeTarget?.previousDayId === previous.id && activeTarget.nextDayId === next.id
  const selectNight = (openPopup = false) => onSelect(selection, openPopup)
  const focusNightLocation = () => {
    if (!night) return
    onStopFocus?.(night.latitude, night.longitude)
  }
  const removeNightLocation = () => {
    if (!night) return
    void runUndoable('suppression du lieu de nuit', async () => { await deleteTripNight(night.id); await reload(trip.id) })
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
      onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('button, a')) return; const openPopup = Boolean(target.closest('.trip-night-stop')); selectNight(openPopup); if (openPopup) focusNightLocation() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNight() } }}
      onDragEnter={(event) => { if (canEdit && event.dataTransfer.types.includes('text/plain')) { setCollapsed(false); setDropActive(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
      onDragOver={(event) => { if (canEdit) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropActive(true) } }}
      onDrop={drop}
    >
      <span className="trip-timeline-night-badge"><Moon aria-hidden="true" size={13} /><b>N{previous.day_number}</b></span>
      <div className="trip-night-content">
        <div className="trip-night-header-row">
          <span className="trip-panel-timeline-heading"><strong>Nuit {previous.day_number}</strong></span>
          <span className="trip-day-header-metrics trip-night-header-metrics" aria-label="Résumé de la nuit">
            <span className="trip-day-header-metric trip-night-recommended" aria-label={`Départ recommandé : ${recommendedLabel}`}>
              <strong><Clock3 aria-hidden="true" size={12} />{recommendedLabel}</strong>
              <small>Départ conseillé</small>
            </span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-night-header-spacer" aria-hidden="true" />
            <span className="trip-day-header-status"><TimelineStatusBadge status={night ? 'valid' : 'empty'} /></span>
            <span className="trip-night-header-spacer" aria-hidden="true" />
          </span>
          <span className="trip-night-header-actions">
            <button className="trip-day-collapse-toggle trip-day-collapse-toggle--inline trip-night-collapse-toggle" type="button" aria-label={`${collapsed ? 'Développer' : 'Réduire'} la nuit ${previous.day_number}`} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><ChevronDown className={collapsed ? 'is-collapsed' : undefined} size={14} /></button>
          </span>
        </div>
        {!collapsed && (night ? <div className="trip-night-stop" aria-label={nightSourceLabel(night.source_type, night.place_id)}>
          <MapPin className="trip-stop-kind" aria-hidden="true" size={14} />
          <span className="trip-night-stop-copy">
            <strong>{dropping ? 'Enregistrement…' : night.name}</strong>
            <small>{nightSourceLabel(night.source_type, night.place_id)}</small>
          </span>
          {(night.google_place_id || canEdit) && <span className="trip-night-stop-actions">
            {night.google_place_id && <a className="trip-night-google-link" href={googleMapsPlaceUrl(night)} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir la fiche Google Maps de ${night.name}`} title="Ouvrir dans Google Maps"><ExternalLink size={11} /></a>}
            {canEdit && <button className="trip-night-remove" type="button" aria-label="Retirer le lieu de la nuit" title="Retirer le lieu" onClick={removeNightLocation}><Trash2 size={11} /></button>}
          </span>}
        </div> : <div className="trip-night-placeholder">{dropActive
          ? <span className="trip-night-drop-indicator" aria-hidden="true"><Plus size={12} />Déposer ici</span>
          : <span>Glissez un POI ou utilisez la recherche de la carte</span>}</div>)}
      </div>
    </div>
  </>
}

function nightSourceLabel(sourceType: Trip['nights'][number]['source_type'] | undefined, placeId: string | null) {
  const source = sourceType ?? (placeId ? 'place' : 'map')
  return source === 'place' ? 'POI' : source === 'imported_text' ? 'Texte de réservation' : 'Point cartographique'
}

function googleMapsPlaceUrl(night: Trip['nights'][number]) {
  const query = [night.name, night.address].filter(Boolean).join(', ')
  const parameters = new URLSearchParams({ api: '1', query, query_place_id: night.google_place_id ?? '' })
  return `https://www.google.com/maps/search/?${parameters.toString()}`
}

function googleMapsAnchorUrl(anchor: NonNullable<Trip['departure']> | NonNullable<Trip['arrival']>) {
  const query = `${anchor.latitude},${anchor.longitude}`
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query }).toString()}`
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
  const StatusIcon = status === 'valid' ? BadgeCheck : status === 'pending' ? Calculator : CircleAlert
  return <span className={`trip-timeline-status trip-timeline-status--${status}`}><StatusIcon aria-hidden="true" size={12} /><strong>{labels[status]}</strong></span>
}

function canCalculateRoute(trip: Trip, day: TripDay, dayIndex: number) { const hasInheritedStart = dayIndex > 0 && trip.days[dayIndex - 1]?.stops.length > 0; const hasStart = dayIndex === 0 ? trip.departure !== null : trip.nights.some((night) => night.next_day_id === day.id) || hasInheritedStart; const hasEnd = trip.nights.some((night) => night.previous_day_id === day.id) || dayIndex === trip.days.length - 1 && (trip.arrival ?? trip.departure) !== null; return day.stops.length + Number(hasStart) + Number(hasEnd) >= 2 }
function readLoadSettings(trip: Trip): TripLoadSettings { return { low_load_max_minutes: trip.low_load_max_minutes, medium_load_max_minutes: trip.medium_load_max_minutes, low_load_color: trip.low_load_color, medium_load_color: trip.medium_load_color, high_load_color: trip.high_load_color } }
