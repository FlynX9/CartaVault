import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from './api/client'
import { deleteMap, getMaps } from './api/maps'
import { getMapPlaces, getPlaceDetails } from './api/places'
import { getStatuses } from './api/statuses'
import { addTripNight, addTripStop, getTrip } from './api/trips'
import { TopBar } from './components/layout/TopBar'
import { MainNavigation, type WorkspacePanel } from './components/layout/MainNavigation'
import { buildMapOpeningFocusRequest, getMapOpeningConfigurationKey } from './components/map/mapOpeningFocus'
import { MapSidebar } from './components/sidebar/MapSidebar'
import { PlaceMapPopup } from './components/map-popup/PlaceMapPopup'
import { deriveMapSidebarState, getSidebarPlaceId } from './components/sidebar/sidebarState'
import { MapPage } from './pages/MapPage'
import { InvitationPage } from './pages/InvitationPage'
import type { PoiMap } from './types/map'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView, PlaceFilters, PlaceMutation, PreviewPlace } from './types/place'
import type { PlaceStatusSummary } from './types/status'
import type { Trip, TripNightTarget } from './types/trip'
import type { GeocodingResult } from './geocoding/types'
import { readMapId, readStatusId, withMap } from './utils/map'
import { deserializePlaceFilters, serializePlaceFilters } from './places/placeFilters'
import { getTripMapBounds } from './components/trips/tripMapBounds'
import { RequireAuth } from './auth/RequireAuth'
import { RequireAdmin } from './auth/RequireAdmin'
import { useAuth } from './auth/useAuth'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import { LoginPage } from './pages/LoginPage'
import { useConfirmDialog } from './components/common/useConfirmDialog'
import { ThemeProvider } from './theme/ThemeProvider'
import { useI18n } from './i18n/useI18n'

const MapsWorkspacePanel = lazy(async () => ({ default: (await import('./components/maps/MapsWorkspacePanel')).MapsWorkspacePanel }))
const MapMembersDialog = lazy(async () => ({ default: (await import('./components/maps/MapMembersDialog')).MapMembersDialog }))
const TripPlannerPanel = lazy(async () => ({ default: (await import('./components/trips/TripPlannerPanel')).TripPlannerPanel }))
const KmzExportDialog = lazy(async () => ({ default: (await import('./components/exports/KmzExportDialog')).KmzExportDialog }))
const MapPlaceList = lazy(async () => ({ default: (await import('./components/place-list/MapPlaceList')).MapPlaceList }))
const MediaWorkspacePanel = lazy(async () => ({ default: (await import('./components/media/MediaWorkspacePanel')).MediaWorkspacePanel }))
const CategoriesWorkspacePanel = lazy(async () => ({ default: (await import('./components/layout/WorkspaceManagementPanels')).CategoriesWorkspacePanel }))
const TagsWorkspacePanel = lazy(async () => ({ default: (await import('./components/layout/WorkspaceManagementPanels')).TagsWorkspacePanel }))
const StatusesWorkspacePanel = lazy(async () => ({ default: (await import('./components/layout/WorkspaceManagementPanels')).StatusesWorkspacePanel }))
const TrashWorkspacePanel = lazy(async () => ({ default: (await import('./components/trash/TrashWorkspacePanel')).TrashWorkspacePanel }))
const AdminConsole = lazy(async () => ({ default: (await import('./pages/admin/AdminConsole')).AdminConsole }))
const DashboardPage = lazy(async () => ({ default: (await import('./components/dashboard/DashboardPage')).DashboardPage }))

const REQUEST_DEBOUNCE_MS = 250
const MAP_ACCESS_REFRESH_MS = 30_000
const INITIAL_MAP_VIEW: MapView = { center: [48.17, 6.45], zoom: 9 }
const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError'
const mapAccessFingerprint = (maps: PoiMap[]) => maps.map((item) => [
  item.id,
  item.updated_at,
  getMapOpeningConfigurationKey(item),
  item.current_user_role,
  item.is_shared,
  item.can_edit,
  item.can_delete,
  item.can_manage_members,
  item.can_transfer_ownership,
  item.can_import,
  item.can_export,
].join(':')).join('|')

function WorkspaceApp() {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const { user } = useAuth()
  const { t } = useI18n()
  const location = useLocation(); const navigate = useNavigate()
  const dashboardOpen = location.pathname === '/dashboard'
  const isMapWorkspace = !dashboardOpen
  const adminOpen = location.pathname.startsWith('/admin')
  const workspacePathname = adminOpen ? '/' : location.pathname
  const locationSearchRef = useRef(location.search)
  locationSearchRef.current = location.search
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const activeMapId = readMapId(location.search)
  const activeStatusId = readStatusId(location.search)
  const placeFilters = useMemo(() => {
    const filters = deserializePlaceFilters(new URLSearchParams(location.search))
    if (activeStatusId && !filters.statusIds.includes(activeStatusId)) filters.statusIds = [...filters.statusIds, activeStatusId]
    return filters
  }, [activeStatusId, location.search])
  const directPlaceId = location.pathname.match(/^\/places\/([^/]+)$/)?.[1] ?? null
  const selectedRoutePlaceId = directPlaceId === 'new' ? null : directPlaceId
  const [maps, setMaps] = useState<PoiMap[]>([]); const activeMap = maps.find((item) => item.id === activeMapId) ?? null
  const [statuses, setStatuses] = useState<PlaceStatusSummary[]>([])
  const [mapsLoading, setMapsLoading] = useState(false); const [mapsError, setMapsError] = useState<string | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null); const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW)
  const [places, setPlaces] = useState<MapPlace[]>([]); const [selectedPlace, setSelectedPlace] = useState<PreviewPlace | null>(null)
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null)
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>('places')
  const [placesPanelCollapsed, setPlacesPanelCollapsed] = useState(false)
  const [collapsedWorkspacePanel, setCollapsedWorkspacePanel] = useState<Exclude<WorkspacePanel, 'places' | null> | null>(null)
  const restorePlacesPanelAfterEditor = useRef(false)
  const [removedPlaceId, setRemovedPlaceId] = useState<string | null>(null); const [isLoading, setIsLoading] = useState(false); const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0); const requestSequence = useRef(0); const focusSequence = useRef(0); const previousMapConfig = useRef<string | null | undefined>(undefined)
  const [temporarySearchResult, setTemporarySearchResult] = useState<GeocodingResult | null>(null)
  const [coordinatePrefill, setCoordinatePrefill] = useState<{ latitude: number; longitude: number } | null>(null)
  const [draftPosition, setDraftPosition] = useState<DraftPosition | null>(null)
  const [exportMap, setExportMap] = useState<PoiMap | null>(null)
  const [membersMap, setMembersMap] = useState<PoiMap | null>(null)
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false)
  const [tripPlannerCollapsed, setTripPlannerCollapsed] = useState(false)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [activeTripDayId, setActiveTripDayId] = useState<string | null>(null)
  const [activeTripNightTarget, setActiveTripNightTarget] = useState<TripNightTarget | null>(null)
  const [tripViewOnly, setTripViewOnly] = useState(false)
  const [hiddenTripDayIds, setHiddenTripDayIds] = useState<Set<string>>(() => new Set())
  const [tripNotice, setTripNotice] = useState<string | null>(null)
  const [createMapRequest, setCreateMapRequest] = useState(0)
  const [importRequest, setImportRequest] = useState(0)
  const [createTripRequest, setCreateTripRequest] = useState(0)
  const tripAddPending = useRef(new Set<string>())
  const tripNoticeTimer = useRef<number | null>(null)
  const openAdmin = useCallback(() => navigate({ pathname: '/admin/users', search: location.search }), [location.search, navigate])
  const openRegistrationRequests = useCallback(() => {
    const search = new URLSearchParams(location.search)
    search.set('admin_notification', 'registration-requests')
    navigate({ pathname: '/admin/users', search: `?${search.toString()}` })
  }, [location.search, navigate])
  const closeAdmin = useCallback(() => navigate({ pathname: '/', search: location.search }), [location.search, navigate])

  useEffect(() => () => { if (tripNoticeTimer.current !== null) window.clearTimeout(tripNoticeTimer.current) }, [])

  const loadMaps = useCallback((silent = false) => {
    const controller = new AbortController()
    if (!silent) {
      setMapsLoading(true)
      setMapsError(null)
    }
    void getMaps(controller.signal).then((loaded) => {
      setMaps((current) => mapAccessFingerprint(current) === mapAccessFingerprint(loaded) ? current : loaded)
      const currentSearch = locationSearchRef.current
      const requestedMapId = readMapId(currentSearch)
      if (requestedMapId === null && loaded.length > 0) {
        navigateRef.current(withMap(workspacePathname, loaded[0].id, readStatusId(currentSearch)), { replace: true })
      } else if (requestedMapId !== null && !loaded.some((item) => item.id === requestedMapId)) {
        navigateRef.current(withMap('/', loaded[0]?.id ?? null, readStatusId(currentSearch)), { replace: true })
      }
    }).catch((error: unknown) => {
      if (!silent && !isAbortError(error)) {
        setMapsError(error instanceof Error ? error.message : 'Impossible de charger les cartes.')
      }
    }).finally(() => {
      if (!silent && !controller.signal.aborted) setMapsLoading(false)
    })
    return () => controller.abort()
  }, [workspacePathname])
  useEffect(() => {
    const abort = loadMaps()
    const refreshVisibleAccess = () => {
      if (document.visibilityState === 'visible') loadMaps(true)
    }
    const interval = window.setInterval(refreshVisibleAccess, MAP_ACCESS_REFRESH_MS)
    window.addEventListener('focus', refreshVisibleAccess)
    document.addEventListener('visibilitychange', refreshVisibleAccess)
    return () => {
      abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisibleAccess)
      document.removeEventListener('visibilitychange', refreshVisibleAccess)
    }
  }, [loadMaps, isMapWorkspace, refreshVersion])

  useEffect(() => { if (!isMapWorkspace || !activeMapId) { setStatuses([]); return }; const controller = new AbortController(); void getStatuses(activeMapId, controller.signal, { activeOnly: true }).then(setStatuses).catch((error: unknown) => { if (!isAbortError(error)) setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les statuts.') }); return () => controller.abort() }, [activeMapId, isMapWorkspace, refreshVersion])

  useEffect(() => {
    const configKey = activeMap === null ? null : getMapOpeningConfigurationKey(activeMap)
    if (previousMapConfig.current === configKey) return
    previousMapConfig.current = configKey; setSelectedPlace(null); setPlaces([]); setBounds(null); setRemovedPlaceId(null)
    if (activeMap) {
      setFocusRequest(buildMapOpeningFocusRequest(activeMap, ++focusSequence.current))
    }
  }, [activeMapId, activeMap])

  useEffect(() => {
    if (!isMapWorkspace || bounds === null || activeMapId === null) return
    const controller = new AbortController(); const sequence = ++requestSequence.current
    const timeout = window.setTimeout(async () => {
      setIsLoading(true); setErrorMessage(null)
      try { const visible = await getMapPlaces({ bounds, mapId: activeMapId, filters: placeFilters, limit: 2000 }, controller.signal); if (sequence === requestSequence.current) { setPlaces(visible.items); setErrorMessage(visible.truncated ? 'Trop de lieux sont visibles. Zoomez pour affiner l’affichage.' : null); setSelectedPlace((current) => current === null ? null : visible.items.find((item) => item.id === current.id) ?? current) } }
      catch (error) {
        if (!isAbortError(error) && sequence === requestSequence.current) {
          if (error instanceof ApiError && error.status === 404) {
            setPlaces([])
            setSelectedPlace(null)
            loadMaps(true)
          } else {
            setErrorMessage(error instanceof Error ? error.message : 'Chargement impossible.')
          }
        }
      }
      finally { if (sequence === requestSequence.current) setIsLoading(false) }
    }, REQUEST_DEBOUNCE_MS)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [activeMapId, bounds, isMapWorkspace, loadMaps, placeFilters, refreshVersion])

  useEffect(() => {
    if (selectedRoutePlaceId === null || places.some((place) => place.id === selectedRoutePlaceId)) return
    const controller = new AbortController()
    void getPlaceDetails(selectedRoutePlaceId, controller.signal).then((place) => {
      if (controller.signal.aborted) return
      if (place.latitude === null || place.longitude === null) return
      const marker: MapPlace = { id: place.id, map_id: place.map_id, name: place.name, latitude: place.latitude, longitude: place.longitude, status: place.status, categories: place.categories, tags: place.tags }
      setPlaces((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); setSelectedPlace(marker)
      setFocusRequest({ id: ++focusSequence.current, view: { center: [marker.latitude, marker.longitude], zoom: Math.max(mapView.zoom, 13) } })
    }).catch((error: unknown) => { if (!isAbortError(error)) setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le POI demandé.') })
    return () => controller.abort()
  }, [mapView.zoom, places, selectedRoutePlaceId])

  const handleMutation = (mutation: PlaceMutation) => { setCoordinatePrefill(null); setDraftPosition(null); setSelectedPlace(null); setRemovedPlaceId(null); setRefreshVersion((value) => value + 1); if (mutation.mapId !== activeMapId) navigate(withMap('/', mutation.mapId, activeStatusId)) }
  const handleDeletePlace = (id: string) => { setPlaces((current) => current.filter((place) => place.id !== id)); setSelectedPlace((current) => current?.id === id ? null : current); setRemovedPlaceId(id); setRefreshVersion((value) => value + 1) }
  const handleSelect = (place: PreviewPlace, revealClusteredPlace = false) => { setSelectedPlace(place); setWorkspacePanel('places'); navigate(withMap(`/places/${place.id}`, activeMapId, activeStatusId)); if (place.latitude !== null && place.longitude !== null) setFocusRequest({ id: ++focusSequence.current, view: { center: [place.latitude, place.longitude], zoom: revealClusteredPlace ? 19 : Math.max(mapView.zoom, 13) } }) }
  const showTripNotice = (message: string) => { setTripNotice(message); if (tripNoticeTimer.current !== null) window.clearTimeout(tripNoticeTimer.current); tripNoticeTimer.current = window.setTimeout(() => setTripNotice(null), 2600) }
  const addPlaceToActiveTripTarget = async (place: PreviewPlace) => {
    if (!tripPlannerOpen || activeMap?.can_edit !== true) return
    if (!activeTrip) { showTripNotice('Créez ou sélectionnez une sortie.'); return }
    if (activeTrip.status === 'completed' || activeTrip.status === 'archived') return
    if (activeTripNightTarget?.nightId) return
    if (!activeTripDayId) { showTripNotice('Sélectionnez une journée.'); return }
    const key = activeTripNightTarget
      ? `night:${activeTripNightTarget.previousDayId}:${activeTripNightTarget.nextDayId}:${place.id}`
      : `day:${activeTripDayId}:${place.id}`
    if (tripAddPending.current.has(key)) return
    if (
      activeTrip.days.some((day) => day.stops.some((stop) => stop.place_id === place.id))
      || activeTrip.nights.some((night) => night.place_id === place.id)
    ) { showTripNotice('Ce POI est déjà présent dans la sortie.'); return }
    tripAddPending.current.add(key)
    try {
      if (activeTripNightTarget) {
        const createdNight = await addTripNight(activeTrip.id, {
          previous_day_id: activeTripNightTarget.previousDayId,
          next_day_id: activeTripNightTarget.nextDayId,
          place_id: place.id,
          source_type: 'place',
        })
        setActiveTripNightTarget({ ...activeTripNightTarget, nightId: createdNight.id })
      } else {
        await addTripStop(activeTripDayId, { place_id: place.id, stop_type: 'place', visit_duration_minutes: 30 })
      }
      const loaded = await getTrip(activeTrip.id); setActiveTrip(loaded)
      const day = loaded.days.find((item) => item.id === activeTripDayId)
      showTripNotice(activeTripNightTarget
        ? `${place.name} ajouté à la nuit sélectionnée.`
        : `${place.name} ajouté${day ? ` au jour ${day.day_number}` : ''}.`)
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : 'Impossible d’ajouter ce POI.')
    } finally {
      tripAddPending.current.delete(key)
    }
  }
  const addCoordinatesToTripDay = async (dayId: string, latitude: number, longitude: number) => {
    if (!activeTrip || activeMap?.can_edit !== true || !activeTrip.days.some((day) => day.id === dayId)) return
    try {
      await addTripStop(dayId, { stop_type: 'free_location', name: `Point ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, latitude, longitude, visit_duration_minutes: 30 })
      const loaded = await getTrip(activeTrip.id); setActiveTrip(loaded); setActiveTripDayId(dayId)
      const day = loaded.days.find((item) => item.id === dayId)
      showTripNotice(`Emplacement ajouté${day ? ` au jour ${day.day_number}` : ''}.`)
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : 'Impossible d’ajouter cet emplacement.')
    }
  }
  const deleteWorkspaceMap = async (poiMap: PoiMap) => {
    if (!await confirm({ title: 'Placer cette carte dans la corbeille ?', message: `La carte « ${poiMap.name} » et son contenu ne seront plus accessibles, mais pourront être restaurés pendant votre délai de conservation.` })) return
    try {
      await deleteMap(poiMap.id)
      const remaining = maps.filter((item) => item.id !== poiMap.id)
      setMaps(remaining)
      if (poiMap.id === activeMapId) navigate(withMap('/', remaining[0]?.id ?? null, activeStatusId))
    } catch (error) {
      setMapsError(error instanceof Error ? error.message : 'Suppression impossible.')
    }
  }
  const sidebarState = deriveMapSidebarState(
    location.pathname,
    selectedRoutePlaceId === null ? null : selectedPlace,
  )
  const selectedPlaceId = getSidebarPlaceId(sidebarState)
  const editorOpen = sidebarState.mode === 'create' || sidebarState.mode === 'edit'
  useEffect(() => {
    if (editorOpen) {
      if (workspacePanel === 'places') {
        restorePlacesPanelAfterEditor.current = true
        setPlacesPanelCollapsed(true)
      }
      return
    }

    if (restorePlacesPanelAfterEditor.current) {
      restorePlacesPanelAfterEditor.current = false
      if (workspacePanel === 'places') setPlacesPanelCollapsed(false)
    }
  }, [editorOpen, workspacePanel])
  useEffect(() => {
    if (editorOpen && activeMap !== null && activeMap.can_edit !== true) {
      navigate(withMap(sidebarState.mode === 'edit' ? `/places/${sidebarState.placeId}` : '/', activeMapId, activeStatusId), { replace: true })
    }
  }, [activeMap, activeMapId, activeStatusId, editorOpen, navigate, sidebarState])
  useEffect(() => {
    if (!editorOpen) setDraftPosition(null)
  }, [editorOpen, location.pathname])
  useEffect(() => {
    setActiveTrip(null)
    setActiveTripDayId(null)
    setActiveTripNightTarget(null)
    setTripPlannerCollapsed(false)
  }, [activeMapId])
  useEffect(() => {
    if (sidebarState.mode === 'create' && draftPosition === null && coordinatePrefill === null && temporarySearchResult === null) setDraftPosition({ latitude: mapView.center[0], longitude: mapView.center[1] })
  }, [coordinatePrefill, draftPosition, mapView.center, sidebarState.mode, temporarySearchResult])
  const closePopup = () => {
    if (sidebarState.mode === 'details' || sidebarState.mode === 'preview') {
      setSelectedPlace(null)
      navigate(withMap('/', activeMapId, activeStatusId))
    }
  }
  const popupContent = selectedPlaceId !== null && !editorOpen ? <PlaceMapPopup placeId={selectedPlaceId} canEdit={activeMap?.can_edit === true} onEdit={() => navigate(withMap(`/places/${selectedPlaceId}/edit`, activeMapId, activeStatusId))} onDeleted={(id) => { handleDeletePlace(id); navigate(withMap('/', activeMapId, activeStatusId)) }} onClose={closePopup} /> : null
  const openWorkspacePanel = (panel: WorkspacePanel) => {
    setWorkspacePanel(panel)
    if (panel !== null && panel !== 'places') setCollapsedWorkspacePanel(null)
    if (panel === null) return
    const panelId = panel === 'places' ? 'map-place-list' : `workspace-${panel}-panel`
    window.setTimeout(() => document.getElementById(panelId)?.focus(), 0)
  }
  const activeTripAddTargetLabel = tripPlannerOpen
    && activeMap?.can_edit === true
    && activeTrip !== null
    && activeTrip.status !== 'completed'
    && activeTrip.status !== 'archived'
    ? activeTripNightTarget === null
      ? activeTrip.days.find((day) => day.id === activeTripDayId)?.day_number
        ? `Ajouter au jour ${activeTrip.days.find((day) => day.id === activeTripDayId)?.day_number}`
        : null
      : activeTripNightTarget.nightId === null
        ? 'Ajouter à la nuit sélectionnée'
        : null
    : null
  const workspaceContent = <Suspense fallback={<aside className="cv-workspace-panel" role="status">Chargement du panneauâ€¦</aside>}>{workspacePanel === 'maps'
    ? <MapsWorkspacePanel maps={maps} activeMapId={activeMapId} isLoading={mapsLoading} errorMessage={mapsError} onOpen={(mapId) => { navigate(withMap('/', mapId, activeStatusId)); setWorkspacePanel('places') }} onDelete={(poiMap) => void deleteWorkspaceMap(poiMap)} onCreated={(poiMap) => { setMaps((current) => [...current, poiMap]); navigate(withMap('/', poiMap.id, activeStatusId)); setWorkspacePanel('places') }} onExport={setExportMap} onMembers={setMembersMap} onAccessChanged={() => setRefreshVersion((value) => value + 1)} collapsed={collapsedWorkspacePanel === 'maps'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'maps' : null)} createRequest={createMapRequest} />
    : workspacePanel === 'places'
    ? <MapPlaceList poiMap={activeMap} statuses={statuses} filters={placeFilters} selectedPlaceId={selectedPlaceId} refreshVersion={refreshVersion} removedPlaceId={removedPlaceId} collapsed={placesPanelCollapsed} onCollapsedChange={setPlacesPanelCollapsed} onFiltersChange={(filters: PlaceFilters) => { const params = serializePlaceFilters(filters); if (activeMapId) params.set('map', activeMapId); navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }) }} onPlaceSelect={(place) => handleSelect(place, true)} onImported={() => setRefreshVersion((value) => value + 1)} onBulkChanged={() => setRefreshVersion((value) => value + 1)} tripPlanningActive={tripPlannerOpen} tripPlaceIds={new Set([...(activeTrip?.days.flatMap((day) => day.stops.map((stop) => stop.place_id)) ?? []), ...(activeTrip?.nights.map((night) => night.place_id) ?? [])].filter((id): id is string => id !== null))} tripAddTargetLabel={activeTripAddTargetLabel} onTripPlaceAdd={(place) => void addPlaceToActiveTripTarget(place)} importRequest={importRequest} />
    : workspacePanel === 'media'
      ? <MediaWorkspacePanel collapsed={collapsedWorkspacePanel === 'media'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'media' : null)} onOpenPlace={(media) => { setWorkspacePanel('places'); navigate(withMap(`/places/${media.place.id}`, media.map.id, null)) }} />
    : workspacePanel === 'categories' && activeMapId !== null ? <CategoriesWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} collapsed={collapsedWorkspacePanel === 'categories'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'categories' : null)} />
      : workspacePanel === 'tags' && activeMapId !== null ? <TagsWorkspacePanel mapId={activeMapId} canEdit={activeMap?.can_edit === true} collapsed={collapsedWorkspacePanel === 'tags'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'tags' : null)} />
        : workspacePanel === 'statuses' ? <StatusesWorkspacePanel mapId={activeMapId ?? undefined} canEdit={activeMap?.can_edit === true} collapsed={collapsedWorkspacePanel === 'statuses'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'statuses' : null)} />
          : workspacePanel === 'trash' ? <TrashWorkspacePanel collapsed={collapsedWorkspacePanel === 'trash'} onCollapsedChange={(collapsed) => setCollapsedWorkspacePanel(collapsed ? 'trash' : null)} onChanged={() => { void loadMaps(true); setRefreshVersion((value) => value + 1) }} />
          : null}</Suspense>

  const handleTripStopFocus = (latitude: number, longitude: number) => {
    setFocusRequest({ id: ++focusSequence.current, view: { center: [latitude, longitude], zoom: Math.max(mapView.zoom, 15) } })
  }
  const handleTripPlaceSelect = async (placeId: string) => {
    const visiblePlace = places.find((item) => item.id === placeId)
    if (visiblePlace) {
      handleSelect(visiblePlace)
      return
    }
    try {
      const controller = new AbortController()
      const place = await getPlaceDetails(placeId, controller.signal)
      if (place.latitude === null || place.longitude === null) {
        showTripNotice('Ce lieu ne possède pas de coordonnées exploitables.')
        return
      }
      const marker: MapPlace = { id: place.id, map_id: place.map_id, name: place.name, latitude: place.latitude, longitude: place.longitude, status: place.status, categories: place.categories, tags: place.tags }
      setPlaces((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker])
      handleSelect(marker)
    } catch (caught) {
      showTripNotice(caught instanceof Error ? caught.message : 'Impossible d’ouvrir ce lieu.')
    }
  }
  const rightSidebar = tripPlannerOpen && activeMap ? <Suspense fallback={<aside className="map-sidebar" role="status">Chargement de la préparation de sortieâ€¦</aside>}><TripPlannerPanel poiMap={activeMap} trip={activeTrip} activeDayId={activeTripDayId} tripViewOnly={tripViewOnly} hiddenDayIds={hiddenTripDayIds} collapsed={tripPlannerCollapsed} createRequest={createTripRequest} onCollapsedChange={setTripPlannerCollapsed} onTripViewOnlyChange={(enabled) => { setTripViewOnly(enabled); setTripPlannerCollapsed(false); setWorkspacePanel(enabled ? null : 'places'); if (enabled) { const tripBounds = getTripMapBounds(activeTrip); if (tripBounds) setFocusRequest({ id: ++focusSequence.current, bounds: tripBounds, maxZoom: 15 }) } }} onDayVisibilityChange={(dayId, visible) => setHiddenTripDayIds((current) => { const next = new Set(current); if (visible) next.delete(dayId); else next.add(dayId); return next })} onTripChange={setActiveTrip} onActiveDayChange={setActiveTripDayId} onActiveNightTargetChange={setActiveTripNightTarget} onStopFocus={handleTripStopFocus} onStopPlaceSelect={(placeId) => { void handleTripPlaceSelect(placeId) }} onClose={() => { setTripPlannerOpen(false); setTripPlannerCollapsed(false); setActiveTrip(null); setActiveTripDayId(null); setActiveTripNightTarget(null); setTripViewOnly(false); setHiddenTripDayIds(new Set()) }} /></Suspense> : <MapSidebar state={sidebarState} activeMapId={activeMapId} activeStatusId={activeStatusId} maps={maps} geographicPrefill={temporarySearchResult} coordinatePrefill={coordinatePrefill} draftPosition={draftPosition} onDraftPositionChange={setDraftPosition} onClose={() => { setCoordinatePrefill(null); setDraftPosition(null); setSelectedPlace(null); navigate(withMap('/', activeMapId, activeStatusId)) }} onPlaceMutated={handleMutation} onPlaceDeleted={handleDeletePlace} />

  const handleWorkspacePanelChange = (panel: WorkspacePanel) => {
    if (dashboardOpen) navigate(withMap('/', activeMapId, activeStatusId))
    if (panel !== 'places' || tripPlannerOpen) {
      setTripPlannerOpen(false)
      setTripPlannerCollapsed(false)
      setActiveTrip(null)
      setActiveTripDayId(null)
      setActiveTripNightTarget(null)
      setTripViewOnly(false)
      setHiddenTripDayIds(new Set())
    }
    if (panel === 'places') setPlacesPanelCollapsed(false)
    else if (panel !== null) setCollapsedWorkspacePanel(null)
    openWorkspacePanel(panel)
  }

  const toggleWorkspacePanelCollapsed = (panel: Exclude<WorkspacePanel, null>) => {
    if (panel === 'places') {
      setPlacesPanelCollapsed((collapsed) => !collapsed)
      return
    }
    if (workspacePanel === panel) setCollapsedWorkspacePanel((current) => current === panel ? null : panel)
    else handleWorkspacePanelChange(panel)
  }

  const openTrips = (create = false) => {
    if (!activeMap) {
      setMapsError('Sélectionnez une carte avant de préparer une sortie.')
      return
    }
    setSelectedPlace(null); setCoordinatePrefill(null); setDraftPosition(null)
    setTripViewOnly(false); setTripPlannerCollapsed(false); setPlacesPanelCollapsed(false)
    setHiddenTripDayIds(new Set())
    navigate(withMap('/', activeMapId, activeStatusId))
    setWorkspacePanel('places')
    setTripPlannerOpen(true)
    if (create) setCreateTripRequest((value) => value + 1)
  }

  const openDashboard = () => {
    setTripPlannerOpen(false)
    setSelectedPlace(null)
    setCoordinatePrefill(null)
    setDraftPosition(null)
    navigate(withMap('/dashboard', activeMapId, activeStatusId))
  }

  return <main className={`app-shell${dashboardOpen ? ' dashboard-shell' : ''}`}><MainNavigation activePanel={dashboardOpen ? null : workspacePanel} dashboardActive={dashboardOpen} tripPlanningActive={!dashboardOpen && tripPlannerOpen} onOpenDashboard={openDashboard} onPanelChange={handleWorkspacePanelChange} onWorkspacePanelToggle={toggleWorkspacePanelCollapsed} onPlacesPanelToggle={() => setPlacesPanelCollapsed((collapsed) => !collapsed)} onOpenTrips={() => openTrips()} isAdmin={user?.is_admin === true} hasMaps={maps.length > 0} /><div className="app-body">
    <TopBar isMapWorkspace={isMapWorkspace} contextLabel={dashboardOpen ? t('dashboard.title') : undefined} markerCount={places.length} onMapAccessChanged={() => setRefreshVersion((value) => value + 1)} onOpenAdmin={openAdmin} onOpenRegistrationRequests={openRegistrationRequests} />
    <Routes>
      <Route path="/dashboard" element={<Suspense fallback={<div className="dashboard-page dashboard-page--state" role="status">Loading…</div>}><DashboardPage
        maps={maps}
        activeMapId={activeMapId}
        onCreateMap={() => { navigate(withMap('/', activeMapId, activeStatusId)); setWorkspacePanel('maps'); setCollapsedWorkspacePanel(null); setCreateMapRequest((value) => value + 1) }}
        onCreatePlace={(mapId) => { const target = maps.find((map) => map.id === mapId); if (target?.can_edit === true) { setWorkspacePanel('places'); navigate(withMap('/places/new', target.id, null)) } }}
        onImportKmz={(mapId) => { const target = maps.find((map) => map.id === mapId); if (target?.can_import !== false && target?.can_edit === true) { navigate(withMap('/', target.id, null)); setWorkspacePanel('places'); setPlacesPanelCollapsed(false); setImportRequest((value) => value + 1) } }}
        onCreateTrip={(mapId) => { const target = maps.find((map) => map.id === mapId); if (target?.can_edit === true) { navigate(withMap('/', target.id, null)); setWorkspacePanel('places'); setPlacesPanelCollapsed(false); setTripPlannerCollapsed(false); setTripPlannerOpen(true); setCreateTripRequest((value) => value + 1) } }}
        onOpenPlace={(placeId, mapId) => { setWorkspacePanel('places'); navigate(withMap(`/places/${placeId}`, mapId, null)) }}
        onOpenTrip={(tripId, mapId) => { navigate(withMap('/', mapId, null)); setWorkspacePanel('places'); setTripPlannerOpen(true); setTripPlannerCollapsed(false); void getTrip(tripId).then((loaded) => { setActiveTrip(loaded); setActiveTripDayId(loaded.days[0]?.id ?? null) }).catch((caught: unknown) => setTripNotice(caught instanceof Error ? caught.message : 'Unable to open this trip.')) }}
      /></Suspense>} />
      <Route path="*" element={<MapPage places={places} canEdit={activeMap?.can_edit === true} selectedPlaceId={selectedPlaceId} initialView={mapView} isLoading={isLoading} errorMessage={errorMessage} sidebarOpen={editorOpen || tripPlannerOpen} sidebarResizable={tripPlannerOpen && !tripPlannerCollapsed} tripPlanningActive={tripPlannerOpen} tripPlannerCollapsed={tripPlannerCollapsed} placeListOpen={workspacePanel !== null} statuses={statuses} focusRequest={focusRequest} popupContent={popupContent} activeCountryCode={activeMap?.country.iso_alpha2} temporarySearchResult={temporarySearchResult} draftPosition={draftPosition} draftPlaceId={sidebarState.mode === 'edit' ? sidebarState.placeId : null} onDraftPositionChange={setDraftPosition} onGeographicResultSelect={(result) => { setTemporarySearchResult(result); setFocusRequest({ id: ++focusSequence.current, view: { center: [result.latitude, result.longitude], zoom: result.boundingBox ? 12 : 15 } }) }} onGeographicResultClear={() => setTemporarySearchResult(null)} onCreateFromGeographicResult={(result) => { setCoordinatePrefill(null); setDraftPosition({ latitude: result.latitude, longitude: result.longitude }); setTemporarySearchResult(result); navigate(withMap('/places/new', activeMapId, activeStatusId)) }} onCreateFromCoordinates={(latitude, longitude) => { setCoordinatePrefill({ latitude, longitude }); setDraftPosition({ latitude, longitude }); setPlacesPanelCollapsed(true); setFocusRequest({ id: ++focusSequence.current, view: { center: [latitude, longitude], zoom: mapView.zoom }, centerInVisibleWorkspace: true }); navigate(withMap('/places/new', activeMapId, activeStatusId)) }} placeList={workspaceContent} sidebar={rightSidebar} trip={activeTrip} tripViewOnly={tripViewOnly} hiddenTripDayIds={hiddenTripDayIds} activeTripDayId={activeTripDayId} onTripPlaceAdd={tripPlannerOpen ? (place) => void addPlaceToActiveTripTarget(place) : undefined} onTripCoordinateAdd={tripPlannerOpen && activeMap?.can_edit === true ? (dayId, latitude, longitude) => void addCoordinatesToTripDay(dayId, latitude, longitude) : undefined} tripNotice={tripNotice} onBoundsChange={setBounds} onViewChange={setMapView} onPlaceSelect={handleSelect} onPopupClose={closePopup} />} />
    </Routes>
  </div>{exportMap && <Suspense fallback={null}><KmzExportDialog poiMap={exportMap} onClose={() => setExportMap(null)} /></Suspense>}{membersMap && <Suspense fallback={null}><MapMembersDialog poiMap={membersMap} onClose={() => setMembersMap(null)} onMapUpdated={(updated) => setMaps((current) => current.map((item) => item.id === updated.id ? updated : item))} /></Suspense>}{adminOpen && <RequireAdmin><Suspense fallback={<div className="account-overlay"><section className="admin-console admin-console--loading" role="status">Chargement de l’administration…</section></div>}><AdminConsole onClose={closeAdmin} /></Suspense></RequireAdmin>}{confirmationDialog}</main>
}

function AppContent() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const isAuthenticationPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname)

  if (loading) return <main className="auth-loading" aria-live="polite">Chargement de CartaVault…</main>
  if (location.pathname.startsWith('/invitations/')) return <Routes><Route path="/invitations/:token" element={<InvitationPage />} /></Routes>
  if (user && isAuthenticationPage) return <Navigate to="/dashboard" replace />
  if (user === null && location.pathname === '/login') return <LoginPage />
  if (location.pathname === '/register') return <RegisterPage />
  if (location.pathname === '/forgot-password') return <ForgotPasswordPage />
  if (location.pathname === '/reset-password') return <ResetPasswordPage />
  if (user === null) return <Navigate to="/login" replace />
  return <RequireAuth><WorkspaceApp /></RequireAuth>
}

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>
}
