import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SquareDashed } from 'lucide-react'

import { BasemapSelector } from '../components/map/BasemapSelector'
import { ACCOUNT_PREFERENCES_UPDATED_EVENT, getAccountPreferences, updateAccountPreferences } from '../api/account'
import { GeographicSearch } from '../components/geocoding/GeographicSearch'
import { MapContextMenu } from '../components/map/MapContextMenu'
import type { MapContextMenuState } from '../components/map/mapContextMenuUtils'
import { PoiMap } from '../components/map/PoiMap'
import { StatusLegend } from '../components/map/StatusLegend'
import { EMPTY_MAP_MARKER_FILTER, MapMarkerFilterContext, type MapMarkerFilter } from '../components/map/mapMarkerFilterContext'
import { getBasemap, getThemeDefaultBasemapId, loadStoredBasemapPreference, resolveAvailableBasemapId, saveBasemapPreference, type BasemapId } from '../map/basemaps'
import { applyDisplayDensity, saveDisplayDensity } from '../theme/displayDensity'
import type { AccountPreferences } from '../types/account'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView } from '../types/place'
import type { PlaceStatusSummary } from '../types/status'
import type { GeocodingResult } from '../geocoding/types'
import type { Trip, TripNightTarget } from '../types/trip'
import { PanelResizeHandle } from '../components/layout/PanelResizeHandle'
import { useTheme } from '../theme/useTheme'
import { useI18n } from '../i18n/useI18n'
import type { MeasurementPoint } from '../components/map/measurement'
import { MapToolsControl } from '../components/map/MapToolsControl'
import type { MapExtent } from '../components/map/mapExtent'
import { mapExtentGeoJson, pointIsInsideExtent } from '../components/map/mapExtent'
import { mapPlaceMatchesMarkerFilter } from '../components/map/mapMarkerFilterContext'
import { isTemporaryMapMode, resolveInteractiveMapMode, type InternalMapToolMode } from '../components/map/mapToolMode'
import { getTripMapBounds } from '../components/trips/tripMapBounds'
import { getPlaceDetails } from '../api/places'
import { getGoogleSatelliteStatus } from '../api/googleSatellite'

const LEFT_PANEL_WIDTH_KEY = 'cartavault:left-panel-width'
const RIGHT_PANEL_WIDTH_KEY = 'cartavault:right-panel-width'
const TRIP_PANEL_MIN_WIDTH = 640
const TRIP_PANEL_MAX_WIDTH = 1600
const TILE_ERROR_FALLBACK_THRESHOLD = 3
const COUNTRY_MASK_PREFERENCE_KEY = 'cartavault:country-mask-enabled'

function resolvePreferredBasemap(value: unknown, theme: 'light' | 'dark', googleSatelliteAvailable = false): BasemapId {
  if (value === 'google-satellite' && googleSatelliteAvailable) return value
  return resolveAvailableBasemapId(value, theme === 'dark')
}

function loadPanelWidth(key: string, fallback: number, min = 320, max = 720): number {
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
  } catch {
    return fallback
  }
}

function savePanelWidth(key: string, width: number): void {
  try { window.localStorage.setItem(key, String(Math.round(width))) } catch { /* Storage may be unavailable in private contexts. */ }
}

function loadCountryMaskPreference(): boolean {
  try { return window.localStorage.getItem(COUNTRY_MASK_PREFERENCE_KEY) !== 'false' } catch { return true }
}

function saveCountryMaskPreference(enabled: boolean): void {
  try { window.localStorage.setItem(COUNTRY_MASK_PREFERENCE_KEY, String(enabled)) } catch { /* Storage may be unavailable. */ }
}

interface MapPageProps {
  activeMapId?: string | null
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  mapNotice?: string | null
  sidebarOpen: boolean
  sidebarResizable?: boolean
  tripPlanningActive?: boolean
  tripPlannerCollapsed?: boolean
  placeCreationActive?: boolean
  placeListOpen: boolean
  statuses: PlaceStatusSummary[]
  canEdit?: boolean
  sidebar: ReactNode
  popupContent?: ReactNode
  mobilePlaceDetailOpen?: boolean
  placeList: ReactNode
  focusRequest: MapFocusRequest | null
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  onPopupClose?: () => void
  activeCountryCode?: string
  activeCountryId?: string
  temporarySearchResult?: GeocodingResult | null
  onGeographicResultSelect?: (result: GeocodingResult) => void
  onGeographicResultClear?: () => void
  onCreateFromGeographicResult?: (result: GeocodingResult) => void
  geographicTripAddTargetLabel?: string | null
  onGeographicResultAddToTrip?: (result: GeocodingResult) => void
  onCreateFromCoordinates?: (latitude: number, longitude: number) => void
  draftPosition?: DraftPosition | null
  draftPlaceId?: string | null
  onDraftPositionChange?: (position: DraftPosition) => void
  trip?: Trip | null
  tripViewOnly?: boolean
  selectedTripStopId?: string | null
  selectedTripTimelineKey?: string | null
  hiddenTripDayIds?: ReadonlySet<string>
  activeTripDayId?: string | null
  activeTripNightTarget?: TripNightTarget | null
  placeSelectionMode?: boolean
  selectedPlaceIds?: ReadonlySet<string>
  onPlaceSelectionToggle?: (placeId: string) => void
  onPlaceSelectionModeChange?: (active: boolean) => void
  onAreaSelectionApply?: (placeIds: string[], strategy: 'replace' | 'add') => void
  tripNotice?: string | null
  onTripCoordinateAdd?: (dayId: string, latitude: number, longitude: number) => void
}

export function MapPage({
  activeMapId = null,
  places,
  selectedPlaceId,
  initialView,
  isLoading: _isLoading,
  errorMessage,
  mapNotice = null,
  sidebarOpen,
  sidebarResizable = false,
  tripPlanningActive = false,
  tripPlannerCollapsed = false,
  placeCreationActive = false,
  placeListOpen,
  statuses,
  canEdit = true,
  sidebar,
  popupContent = null,
  mobilePlaceDetailOpen = false,
  placeList,
  focusRequest,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  onPopupClose = () => undefined,
  activeCountryCode,
  activeCountryId,
  temporarySearchResult = null,
  onGeographicResultSelect = () => undefined,
  onGeographicResultClear = () => undefined,
  onCreateFromGeographicResult = () => undefined,
  geographicTripAddTargetLabel = null,
  onGeographicResultAddToTrip = () => undefined,
  onCreateFromCoordinates = () => undefined,
  draftPosition = null,
  draftPlaceId = null,
  onDraftPositionChange = () => undefined,
  trip = null,
  tripViewOnly = false,
  selectedTripStopId = null,
  selectedTripTimelineKey = null,
  hiddenTripDayIds = new Set<string>(),
  activeTripDayId = null,
  activeTripNightTarget = null,
  placeSelectionMode = false,
  selectedPlaceIds = new Set<string>(),
  onPlaceSelectionToggle = () => undefined,
  onPlaceSelectionModeChange = () => undefined,
  onAreaSelectionApply = () => undefined,
  tripNotice = null,
  onTripCoordinateAdd,
}: MapPageProps) {
  const { resolvedTheme } = useTheme()
  const { locale, t } = useI18n()
  const themeRef = useRef(resolvedTheme)
  themeRef.current = resolvedTheme
  const initialBasemapRef = useRef(resolvePreferredBasemap(
    loadStoredBasemapPreference() ?? getThemeDefaultBasemapId(resolvedTheme === 'dark'),
    resolvedTheme,
  ))
  const [basemapId, setBasemapId] = useState<BasemapId>(initialBasemapRef.current)
  const [satelliteProvider, setSatelliteProvider] = useState<'stadia' | 'google'>(initialBasemapRef.current === 'google-satellite' ? 'google' : 'stadia')
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null)
  const [googleSatelliteAvailable, setGoogleSatelliteAvailable] = useState(false)
  const googleSatelliteAvailableRef = useRef(false)
  const accountPreferencesRef = useRef<AccountPreferences | null>(null)
  const explicitBasemapSelectionRef = useRef<BasemapId | null>(null)
  const previousThemeRef = useRef(resolvedTheme)
  const tileFailuresRef = useRef(new Map<BasemapId, number>())
  const failedBasemapsRef = useRef(new Set<BasemapId>())
  const [localSearchResult, setLocalSearchResult] = useState<GeocodingResult | null>(null)
  const [contextMenu, setContextMenu] = useState<MapContextMenuState | null>(null)
  const [contextNotice, setContextNotice] = useState<string | null>(null)
  const [markerFilter, setMarkerFilter] = useState<MapMarkerFilter>(EMPTY_MAP_MARKER_FILTER)
  const [countryMaskEnabled, setCountryMaskEnabled] = useState(loadCountryMaskPreference)
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => loadPanelWidth(LEFT_PANEL_WIDTH_KEY, 430))
  const [rightPanelWidth, setRightPanelWidth] = useState(() => loadPanelWidth(RIGHT_PANEL_WIDTH_KEY, 640, TRIP_PANEL_MIN_WIDTH, TRIP_PANEL_MAX_WIDTH))
  const [measurementActive, setMeasurementActive] = useState(false)
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([])
  const [internalToolMode, setInternalToolMode] = useState<InternalMapToolMode>('navigation')
  const [temporaryExtent, setTemporaryExtent] = useState<MapExtent | null>(null)
  const [temporaryCoordinate, setTemporaryCoordinate] = useState<MeasurementPoint | null>(null)
  const [geolocationFix, setGeolocationFix] = useState<(MeasurementPoint & { accuracy: number }) | null>(null)
  const [geolocationLoading, setGeolocationLoading] = useState(false)
  const [mapToolsNotice, setMapToolsNotice] = useState<string | null>(null)
  const [selectionStrategy, setSelectionStrategy] = useState<'replace' | 'add'>('replace')
  const [toolFocusRequest, setToolFocusRequest] = useState<MapFocusRequest | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenLayoutVersion, setFullscreenLayoutVersion] = useState(0)
  const mapLayoutRef = useRef<HTMLDivElement>(null)
  const selectionFitControllerRef = useRef<AbortController | null>(null)
  const selectedSearchResult = temporarySearchResult ?? localSearchResult
  const effectiveMode = resolveInteractiveMapMode({
    internalMode: internalToolMode,
    placeCreationActive: placeCreationActive || draftPosition !== null,
    tripPlanningActive,
    pointSelectionActive: placeSelectionMode,
  })
  const filteredMapPlaces = useMemo(() => places.filter((place) => mapPlaceMatchesMarkerFilter(place, markerFilter)), [markerFilter, places])
  const areaCandidateIds = useMemo(() => temporaryExtent?.locked
    ? filteredMapPlaces.filter((place) => pointIsInsideExtent(place, temporaryExtent)).map((place) => place.id)
    : [], [filteredMapPlaces, temporaryExtent])
  const normalizedTrip = useMemo<Trip | null>(() => trip === null ? null : {
    ...trip,
    nights: trip.nights ?? [],
    days: (trip.days ?? []).map((day) => ({ ...day, stops: day.stops ?? [] })),
  }, [trip])

  useEffect(() => {
    let current = true
    void getAccountPreferences().then((preferences) => {
      if (!current) return
      accountPreferencesRef.current = preferences
      setSatelliteProvider(preferences.basemaps?.satellite_provider ?? (preferences.preferred_basemap === 'google-satellite' ? 'google' : 'stadia'))
      applyDisplayDensity(preferences.density)
      saveDisplayDensity(preferences.density, window.localStorage)
      const explicitSelection = explicitBasemapSelectionRef.current
      if (explicitSelection !== null) {
        if (preferences.preferred_basemap !== explicitSelection) {
          const updated = { ...preferences, preferred_basemap: explicitSelection }
          accountPreferencesRef.current = updated
          void updateAccountPreferences(updated).then((saved) => { accountPreferencesRef.current = saved }).catch(() => undefined)
        }
        return
      }
      if (failedBasemapsRef.current.size > 0) return
      const preferred = resolvePreferredBasemap(preferences.preferred_basemap, themeRef.current, googleSatelliteAvailableRef.current)
      setBasemapId(preferred)
      saveBasemapPreference(preferred)
    }).catch(() => undefined)
    const onPreferencesUpdated = (event: Event) => {
      const preferences = (event as CustomEvent<AccountPreferences>).detail
      accountPreferencesRef.current = preferences
      setSatelliteProvider(preferences.basemaps?.satellite_provider ?? (preferences.preferred_basemap === 'google-satellite' ? 'google' : 'stadia'))
      applyDisplayDensity(preferences.density)
      saveDisplayDensity(preferences.density, window.localStorage)
      const preferred = resolvePreferredBasemap(preferences.preferred_basemap, themeRef.current, googleSatelliteAvailableRef.current)
      setBasemapId(preferred)
      saveBasemapPreference(preferred)
      setBasemapNotice(null)
    }
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated)
    return () => { current = false; window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void getGoogleSatelliteStatus(controller.signal).then((status) => {
      if (controller.signal.aborted) return
      googleSatelliteAvailableRef.current = status.available
      setGoogleSatelliteAvailable(status.available)
      const preferred = accountPreferencesRef.current?.preferred_basemap
      if (status.available && preferred === 'google-satellite' && explicitBasemapSelectionRef.current === null) {
        setBasemapId('google-satellite'); saveBasemapPreference('google-satellite')
      }
      if (status.warning_level >= 80) setBasemapNotice(`Google Satellite approche du seuil d’usage configuré (${status.warning_level} %).`)
    }).catch(() => { googleSatelliteAvailableRef.current = false; setGoogleSatelliteAvailable(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (previousThemeRef.current === resolvedTheme) return
    previousThemeRef.current = resolvedTheme
    if (basemapId !== 'cartavault-light' && basemapId !== 'cartavault-dark') return
    explicitBasemapSelectionRef.current = null
    const themedBasemap: BasemapId = resolvedTheme === 'dark' ? 'cartavault-dark' : 'cartavault-light'
    if (basemapId === themedBasemap) return
    setBasemapId(themedBasemap)
    saveBasemapPreference(themedBasemap)
    const currentPreferences = accountPreferencesRef.current
    if (currentPreferences !== null && currentPreferences.preferred_basemap !== themedBasemap) {
      const updated = { ...currentPreferences, preferred_basemap: themedBasemap }
      accountPreferencesRef.current = updated
      void updateAccountPreferences(updated).then((saved) => {
        accountPreferencesRef.current = saved
      }).catch(() => undefined)
    }
  }, [basemapId, resolvedTheme])

  const resetTemporaryTools = (clearMeasurement = true) => {
    setInternalToolMode('navigation')
    setTemporaryExtent(null)
    setTemporaryCoordinate(null)
    setGeolocationFix(null)
    setGeolocationLoading(false)
    setMapToolsNotice(null)
    if (clearMeasurement) setMeasurementPoints([])
    setMeasurementActive(false)
  }

  useEffect(() => {
    resetTemporaryTools()
  }, [activeMapId])

  useEffect(() => {
    setToolFocusRequest(null)
  }, [focusRequest])

  useEffect(() => () => selectionFitControllerRef.current?.abort(), [])

  useEffect(() => {
    if (!tripPlanningActive && !placeCreationActive && draftPosition === null && !placeSelectionMode) return
    if (internalToolMode !== 'navigation') resetTemporaryTools()
  }, [draftPosition, internalToolMode, placeCreationActive, placeSelectionMode, tripPlanningActive])

  useEffect(() => {
    const cancelTemporaryMode = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTemporaryMapMode(effectiveMode)) return
      if (document.fullscreenElement === mapLayoutRef.current) return
      event.preventDefault()
      resetTemporaryTools()
    }
    window.addEventListener('keydown', cancelTemporaryMode)
    return () => window.removeEventListener('keydown', cancelTemporaryMode)
  }, [effectiveMode])

  useEffect(() => {
    const updateFullscreenState = () => {
      setFullscreen(document.fullscreenElement === mapLayoutRef.current)
      setFullscreenLayoutVersion((value) => value + 1)
    }
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  const setToolMode = (nextMode: InternalMapToolMode) => {
    if (tripPlanningActive || placeCreationActive || draftPosition !== null) return
    if (placeSelectionMode) onPlaceSelectionModeChange(false)
    setMapToolsNotice(null)
    setTemporaryExtent(null)
    setTemporaryCoordinate(null)
    setGeolocationFix(null)
    if (nextMode !== 'measurement' && nextMode !== 'navigation') setMeasurementPoints([])
    setInternalToolMode(nextMode)
    setMeasurementActive(nextMode === 'measurement')
  }

  const boundsForPlaces = (items: Array<{ latitude: number; longitude: number }>): MapBounds | null => items.length === 0 ? null : items.reduce<MapBounds>((result, place) => ({
    minLatitude: Math.min(result.minLatitude, place.latitude),
    maxLatitude: Math.max(result.maxLatitude, place.latitude),
    minLongitude: Math.min(result.minLongitude, place.longitude),
    maxLongitude: Math.max(result.maxLongitude, place.longitude),
  }), { minLatitude: items[0].latitude, maxLatitude: items[0].latitude, minLongitude: items[0].longitude, maxLongitude: items[0].longitude })

  const requestBoundsFocus = (requestedBounds: MapBounds | null) => {
    if (requestedBounds === null) { setMapToolsNotice(t('map.tools.fit.empty')); return }
    setMapToolsNotice(null)
    setToolFocusRequest({ id: Date.now(), bounds: requestedBounds, maxZoom: 16 })
  }

  const fitCurrentSelection = async () => {
    selectionFitControllerRef.current?.abort()
    const controller = new AbortController()
    selectionFitControllerRef.current = controller
    const selectedIds = [...selectedPlaceIds]
    const localPlaces = places.filter((place) => selectedPlaceIds.has(place.id))
    const localIds = new Set(localPlaces.map((place) => place.id))
    const missingResults = await Promise.allSettled(selectedIds.filter((id) => !localIds.has(id)).map((id) => getPlaceDetails(id, controller.signal)))
    if (controller.signal.aborted) return
    const coordinates = [
      ...localPlaces,
      ...missingResults.flatMap((result) => result.status === 'fulfilled' && result.value.latitude !== null && result.value.longitude !== null
        ? [{ latitude: result.value.latitude, longitude: result.value.longitude }]
        : []),
    ]
    requestBoundsFocus(boundsForPlaces(coordinates))
    if (selectionFitControllerRef.current === controller) selectionFitControllerRef.current = null
  }

  const requestGeolocation = () => {
    if (tripPlanningActive || placeCreationActive || draftPosition !== null) return
    if (!navigator.geolocation) { setMapToolsNotice(t('map.tools.geolocation.unavailable')); return }
    if (placeSelectionMode) onPlaceSelectionModeChange(false)
    setInternalToolMode('geolocation')
    setMeasurementActive(false)
    setTemporaryExtent(null)
    setTemporaryCoordinate(null)
    setGeolocationLoading(true)
    setMapToolsNotice(null)
    navigator.geolocation.getCurrentPosition((position) => {
      const fix = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
      setGeolocationFix(fix)
      setGeolocationLoading(false)
      setToolFocusRequest({ id: Date.now(), view: { center: [fix.latitude, fix.longitude], zoom: 16 } })
    }, (error) => {
      setGeolocationLoading(false)
      setInternalToolMode('navigation')
      setMapToolsNotice(error.code === error.PERMISSION_DENIED ? t('map.tools.geolocation.denied') : t('map.tools.geolocation.unavailable'))
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 })
  }

  const toggleFullscreen = () => {
    const target = mapLayoutRef.current
    if (!target?.requestFullscreen) { setMapToolsNotice(t('map.tools.fullscreen.unavailable')); return }
    if (document.fullscreenElement === target) void document.exitFullscreen()
    else void target.requestFullscreen().catch(() => setMapToolsNotice(t('map.tools.fullscreen.unavailable')))
  }

  const selectBasemap = (id: BasemapId) => {
    const selected = id === 'google-satellite' && googleSatelliteAvailableRef.current ? id : resolveAvailableBasemapId(id)
    explicitBasemapSelectionRef.current = selected
    setBasemapId(selected)
    setBasemapNotice(null)
    tileFailuresRef.current.clear()
    failedBasemapsRef.current.clear()
    saveBasemapPreference(selected)
    const currentPreferences = accountPreferencesRef.current
    const provider = selected === 'google-satellite' ? 'google' : selected === 'satellite' ? 'stadia' : currentPreferences?.basemaps?.satellite_provider
    if (currentPreferences !== null && (currentPreferences.preferred_basemap !== selected || (provider !== undefined && currentPreferences.basemaps?.satellite_provider !== provider))) {
      const updated = { ...currentPreferences, preferred_basemap: selected, ...(provider ? { basemaps: { satellite_provider: provider } } : {}) }
      if (provider) setSatelliteProvider(provider)
      accountPreferencesRef.current = updated
      void updateAccountPreferences(updated).then((saved) => {
        accountPreferencesRef.current = saved
      }).catch(() => undefined)
    }
  }

  const handleBasemapTileError = (sourceId: BasemapId, fatal = false) => {
    if (sourceId !== basemapId || failedBasemapsRef.current.has(sourceId)) return
    const failures = fatal ? TILE_ERROR_FALLBACK_THRESHOLD : (tileFailuresRef.current.get(sourceId) ?? 0) + 1
    tileFailuresRef.current.set(sourceId, failures)
    if (failures < TILE_ERROR_FALLBACK_THRESHOLD) return
    failedBasemapsRef.current.add(sourceId)
    if (sourceId === 'osm') {
      setBasemapNotice('OpenStreetMap est temporairement indisponible. La carte sera réessayée automatiquement.')
      return
    }
    setBasemapId('osm')
    saveBasemapPreference('osm')
    setBasemapNotice(`Le fond ${getBasemap(sourceId).label} est indisponible. OpenStreetMap a été activé automatiquement.`)
  }
  return (
    <section
      className={`map-workspace${placeListOpen ? ' place-list-open' : ''}${sidebarOpen ? ' sidebar-open' : ''}${tripPlanningActive ? ' trip-planning-open' : ''}${tripPlannerCollapsed ? ' trip-planner-collapsed' : ''}${mobilePlaceDetailOpen ? ' mobile-place-detail-open' : ''}`}
      style={{ '--cv-left-panel-width': `${leftPanelWidth}px`, '--cv-right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
    >
      <MapMarkerFilterContext.Provider value={{ filter: markerFilter, setFilter: setMarkerFilter }}>{placeList}</MapMarkerFilterContext.Provider>
      {placeListOpen && <PanelResizeHandle side="left" width={leftPanelWidth} onResize={setLeftPanelWidth} onResizeCommit={(width) => savePanelWidth(LEFT_PANEL_WIDTH_KEY, width)} />}
      <div ref={mapLayoutRef} className="map-layout" aria-label="Carte des points d'intérêt">
        <PoiMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          initialView={initialView}
          onBoundsChange={onBoundsChange}
          onViewChange={onViewChange}
          onPlaceSelect={onPlaceSelect}
          focusRequest={toolFocusRequest ?? focusRequest}
          layoutKey={`${placeListOpen}-${sidebarOpen}-${fullscreenLayoutVersion}`}
          onPopupClose={onPopupClose}
          basemapId={basemapId}
          onBasemapTileError={handleBasemapTileError}
          temporarySearchResult={sidebarOpen ? null : selectedSearchResult}
          onMapContextMenuOpen={setContextMenu}
          onMapContextMenuClose={() => setContextMenu(null)}
          draftPosition={draftPosition}
          draftPlaceId={draftPlaceId}
          onDraftPositionChange={onDraftPositionChange}
          markerFilter={markerFilter}
          trip={trip}
          tripViewOnly={tripViewOnly}
          selectedTripStopId={selectedTripStopId}
          selectedTripTimelineKey={selectedTripTimelineKey}
          hiddenTripDayIds={hiddenTripDayIds}
          activeTripDayId={activeTripDayId}
          activeTripNightTarget={activeTripNightTarget}
          selectionMode={placeSelectionMode}
          selectedPlaceIds={selectedPlaceIds}
          onPlaceSelectionToggle={onPlaceSelectionToggle}
          countryId={activeCountryId ?? null}
          countryMaskEnabled={countryMaskEnabled}
          measurementActive={measurementActive}
          measurementPoints={measurementPoints}
          measurementLocale={locale}
          onMeasurementPointAdd={(point) => setMeasurementPoints((current) => [...current, point])}
          mapToolMode={internalToolMode}
          temporaryExtent={temporaryExtent}
          temporaryCoordinate={temporaryCoordinate}
          geolocationFix={geolocationFix}
          onTemporaryExtentChange={setTemporaryExtent}
          onTemporaryCoordinateChange={setTemporaryCoordinate}
        />
        {popupContent && (
          <aside className="map-place-detail-overlay" aria-label="Détails du lieu sélectionné">
            {popupContent}
          </aside>
        )}
        {contextMenu && <MapContextMenu state={contextMenu} canCreate={canEdit} tripDays={onTripCoordinateAdd ? trip?.days.map((day) => ({ id: day.id, label: `Jour ${day.day_number}${day.title ? ` · ${day.title}` : ''}` })) : []} onAddToTripDay={onTripCoordinateAdd ? (dayId) => { const { latitude, longitude } = contextMenu; setContextMenu(null); onTripCoordinateAdd(dayId, latitude, longitude) } : undefined} onClose={() => setContextMenu(null)} onCreate={() => { const { latitude, longitude } = contextMenu; setContextMenu(null); onCreateFromCoordinates(latitude, longitude) }} onCopy={() => { void navigator.clipboard?.writeText(`${contextMenu.latitude.toFixed(6)}, ${contextMenu.longitude.toFixed(6)}`).then(() => setContextNotice('Coordonnées copiées')).catch(() => setContextNotice('Copie indisponible')); setContextMenu(null) }} />}
        {contextNotice && <p className="context-notice" role="status">{contextNotice}</p>}
        {tripNotice && <p className="context-notice trip-notice" role="status">{tripNotice}</p>}
        {mapNotice && <p className="map-results-notice" role="status">{mapNotice}</p>}
        <div className="map-overlay-controls">
          <MapToolsControl
            mode={effectiveMode}
            internalMode={internalToolMode}
            measurementPoints={measurementPoints}
            extent={temporaryExtent}
            coordinate={temporaryCoordinate}
            selectedCount={selectedPlaceIds.size}
            areaCandidateCount={areaCandidateIds.length}
            selectionStrategy={selectionStrategy}
            fullscreen={fullscreen}
            geolocationLoading={geolocationLoading}
            notice={mapToolsNotice}
            canCreate={canEdit}
            canUseInternalTools={!tripPlanningActive && !placeCreationActive && draftPosition === null}
            hasVisiblePlaces={filteredMapPlaces.length > 0}
            hasSelectedPlaces={selectedPlaceIds.size > 0}
            hasTrip={getTripMapBounds(normalizedTrip) !== null}
            hasActiveDay={Boolean(normalizedTrip?.days.some((day) => day.id === activeTripDayId && (day.stops.length > 0 || day.route_geometry?.coordinates.length)))}
            onModeChange={(mode) => { setContextMenu(null); setToolMode(mode) }}
            onUndoMeasurement={() => setMeasurementPoints((current) => current.slice(0, -1))}
            onReset={() => resetTemporaryTools()}
            onSelectionStrategyChange={setSelectionStrategy}
            onApplyAreaSelection={() => {
              onAreaSelectionApply(areaCandidateIds, selectionStrategy)
              onPlaceSelectionModeChange(true)
              setTemporaryExtent(null)
              setInternalToolMode('navigation')
            }}
            onCopyExtent={() => {
              if (!temporaryExtent) return
              void navigator.clipboard?.writeText(mapExtentGeoJson(temporaryExtent)).then(() => setMapToolsNotice(t('map.tools.extent.copied'))).catch(() => setMapToolsNotice(t('map.tools.coordinates.copyError')))
            }}
            onFitVisible={() => requestBoundsFocus(boundsForPlaces(filteredMapPlaces))}
            onFitSelection={() => { void fitCurrentSelection() }}
            onFitTrip={() => requestBoundsFocus(getTripMapBounds(normalizedTrip))}
            onFitDay={() => {
              const day = normalizedTrip?.days.find((item) => item.id === activeTripDayId)
              requestBoundsFocus(day && normalizedTrip ? getTripMapBounds({ ...normalizedTrip, departure: null, arrival: null, nights: [], days: [day] }) : null)
            }}
            onToggleFullscreen={toggleFullscreen}
            onRequestGeolocation={requestGeolocation}
            onCopyCoordinates={() => {
              if (!temporaryCoordinate) return
              void navigator.clipboard?.writeText(`${temporaryCoordinate.latitude.toFixed(6)}, ${temporaryCoordinate.longitude.toFixed(6)}`).then(() => setMapToolsNotice(t('map.tools.coordinates.copied'))).catch(() => setMapToolsNotice(t('map.tools.coordinates.copyError')))
            }}
            onCreateAtCoordinate={() => {
              if (!temporaryCoordinate) return
              onCreateFromCoordinates(temporaryCoordinate.latitude, temporaryCoordinate.longitude)
              resetTemporaryTools()
            }}
          />
          <div className="map-overlay-control-slot map-overlay-control-slot--legend">
            <StatusLegend statuses={statuses} />
          </div>
          {!tripViewOnly && (
            <div className="map-overlay-control-slot map-overlay-control-slot--search">
              <GeographicSearch focus={initialView.center} countryCode={activeCountryCode} selected={selectedSearchResult} canCreate={canEdit} tripAddTargetLabel={geographicTripAddTargetLabel} onSelect={(result) => { setLocalSearchResult(result); onGeographicResultSelect(result) }} onClear={() => { setLocalSearchResult(null); onGeographicResultClear() }} onCreate={onCreateFromGeographicResult} onAddToTrip={onGeographicResultAddToTrip} />
            </div>
          )}
          <div className="map-overlay-control-slot map-overlay-control-slot--basemap">
            <BasemapSelector activeBasemapId={basemapId} onBasemapChange={selectBasemap} googleSatelliteAvailable={googleSatelliteAvailable} satelliteProvider={satelliteProvider} />
          </div>
          {activeCountryId && <div className="map-overlay-control-slot map-overlay-control-slot--country-mask">
            <button
              className={`country-mask-toggle${countryMaskEnabled ? ' active' : ''}`}
              type="button"
              aria-label={countryMaskEnabled ? 'Désactiver le masque hors pays' : 'Activer le masque hors pays'}
              aria-pressed={countryMaskEnabled}
              title={countryMaskEnabled ? 'Masque hors pays activé' : 'Masque hors pays désactivé'}
              onClick={() => setCountryMaskEnabled((current) => {
                const next = !current
                saveCountryMaskPreference(next)
                return next
              })}
            >
              <SquareDashed size={18} aria-hidden="true" />
            </button>
          </div>}
        </div>
        {basemapNotice && <div className="basemap-error" role="status">{basemapNotice}</div>}

        {errorMessage !== null && (
          <div className="status-banner error-status" role="alert">
            <strong>Impossible de charger la carte.</strong>
            <span>{errorMessage}</span>
          </div>
        )}

      </div>
      {sidebar}
      {sidebarOpen && sidebarResizable && !tripViewOnly && <PanelResizeHandle side="right" growDirection={tripPlanningActive ? 'right' : undefined} width={rightPanelWidth} minWidth={tripPlanningActive ? TRIP_PANEL_MIN_WIDTH : undefined} maxWidth={tripPlanningActive ? TRIP_PANEL_MAX_WIDTH : undefined} reservedWidth={tripPlanningActive ? 352 : undefined} panelSelector={tripPlanningActive ? '.trip-planner-panel' : undefined} boundarySelector={tripPlanningActive ? '.map-place-detail-overlay' : undefined} gapReferenceSelector={tripPlanningActive ? '.country-place-panel' : undefined} onResize={setRightPanelWidth} onResizeCommit={(width) => savePanelWidth(RIGHT_PANEL_WIDTH_KEY, width)} />}
    </section>
  )
}
