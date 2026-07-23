import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { BasemapSelector } from '../components/map/BasemapSelector'
import { ACCOUNT_PREFERENCES_UPDATED_EVENT, getAccountPreferences, updateAccountPreferences } from '../api/account'
import { GeographicSearch } from '../components/geocoding/GeographicSearch'
import { MapContextMenu } from '../components/map/MapContextMenu'
import type { MapContextMenuState } from '../components/map/mapContextMenuUtils'
import { PoiMap } from '../components/map/PoiMap'
import { StatusLegend } from '../components/map/StatusLegend'
import { EMPTY_MAP_MARKER_FILTER, MapMarkerFilterContext, type MapMarkerFilter } from '../components/map/mapMarkerFilterContext'
import { getBasemap, getThemeDefaultBasemapId, loadStoredBasemapPreference, resolveAvailableBasemapId, saveBasemapPreference, type BasemapId } from '../map/basemaps'
import type { AccountPreferences } from '../types/account'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView } from '../types/place'
import type { PlaceStatusSummary } from '../types/status'
import type { GeocodingResult } from '../geocoding/types'
import type { Trip } from '../types/trip'
import { PanelResizeHandle } from '../components/layout/PanelResizeHandle'
import { useTheme } from '../theme/useTheme'

const LEFT_PANEL_WIDTH_KEY = 'cartavault:left-panel-width'
const RIGHT_PANEL_WIDTH_KEY = 'cartavault:right-panel-width'
const TILE_ERROR_FALLBACK_THRESHOLD = 3

function resolveThemeBasemap(value: unknown, theme: 'light' | 'dark'): BasemapId {
  if (value === 'cartavault-light' || value === 'cartavault-dark') {
    return resolveAvailableBasemapId(theme === 'dark' ? 'cartavault-dark' : 'cartavault-light', theme === 'dark')
  }
  return resolveAvailableBasemapId(value, theme === 'dark')
}

function loadPanelWidth(key: string, fallback: number): number {
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) && value >= 320 && value <= 720 ? value : fallback
  } catch {
    return fallback
  }
}

function savePanelWidth(key: string, width: number): void {
  try { window.localStorage.setItem(key, String(Math.round(width))) } catch { /* Storage may be unavailable in private contexts. */ }
}

interface MapPageProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  mapNotice?: string | null
  sidebarOpen: boolean
  sidebarResizable?: boolean
  placeListOpen: boolean
  statuses: PlaceStatusSummary[]
  canEdit?: boolean
  sidebar: ReactNode
  popupContent?: ReactNode
  placeList: ReactNode
  focusRequest: MapFocusRequest | null
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  onPopupClose?: () => void
  activeCountryCode?: string
  temporarySearchResult?: GeocodingResult | null
  onGeographicResultSelect?: (result: GeocodingResult) => void
  onGeographicResultClear?: () => void
  onCreateFromGeographicResult?: (result: GeocodingResult) => void
  onCreateFromCoordinates?: (latitude: number, longitude: number) => void
  draftPosition?: DraftPosition | null
  draftPlaceId?: string | null
  onDraftPositionChange?: (position: DraftPosition) => void
  trip?: Trip | null
  tripViewOnly?: boolean
  hiddenTripDayIds?: ReadonlySet<string>
  activeTripDayId?: string | null
  onTripPlaceAdd?: (place: MapPlace) => void
  tripNotice?: string | null
  onTripCoordinateAdd?: (dayId: string, latitude: number, longitude: number) => void
}

export function MapPage({
  places,
  selectedPlaceId,
  initialView,
  isLoading,
  errorMessage,
  mapNotice = null,
  sidebarOpen,
  sidebarResizable = false,
  placeListOpen,
  statuses,
  canEdit = true,
  sidebar,
  popupContent = null,
  placeList,
  focusRequest,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  onPopupClose = () => undefined,
  activeCountryCode,
  temporarySearchResult = null,
  onGeographicResultSelect = () => undefined,
  onGeographicResultClear = () => undefined,
  onCreateFromGeographicResult = () => undefined,
  onCreateFromCoordinates = () => undefined,
  draftPosition = null,
  draftPlaceId = null,
  onDraftPositionChange = () => undefined,
  trip = null,
  tripViewOnly = false,
  hiddenTripDayIds = new Set<string>(),
  activeTripDayId = null,
  onTripPlaceAdd,
  tripNotice = null,
  onTripCoordinateAdd,
}: MapPageProps) {
  const { resolvedTheme, setPreference: setThemePreference } = useTheme()
  const themeRef = useRef(resolvedTheme)
  themeRef.current = resolvedTheme
  const initialBasemapRef = useRef(resolveThemeBasemap(
    loadStoredBasemapPreference() ?? getThemeDefaultBasemapId(resolvedTheme === 'dark'),
    resolvedTheme,
  ))
  const [basemapId, setBasemapId] = useState<BasemapId>(initialBasemapRef.current)
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null)
  const accountPreferencesRef = useRef<AccountPreferences | null>(null)
  const explicitBasemapSelectionRef = useRef<BasemapId | null>(null)
  const tileFailuresRef = useRef(new Map<BasemapId, number>())
  const failedBasemapsRef = useRef(new Set<BasemapId>())
  const [localSearchResult, setLocalSearchResult] = useState<GeocodingResult | null>(null)
  const [contextMenu, setContextMenu] = useState<MapContextMenuState | null>(null)
  const [contextNotice, setContextNotice] = useState<string | null>(null)
  const [markerFilter, setMarkerFilter] = useState<MapMarkerFilter>(EMPTY_MAP_MARKER_FILTER)
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => loadPanelWidth(LEFT_PANEL_WIDTH_KEY, 430))
  const [rightPanelWidth, setRightPanelWidth] = useState(() => loadPanelWidth(RIGHT_PANEL_WIDTH_KEY, 640))
  const selectedSearchResult = temporarySearchResult ?? localSearchResult

  useEffect(() => {
    let current = true
    void getAccountPreferences().then((preferences) => {
      if (!current) return
      accountPreferencesRef.current = preferences
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
      const preferred = resolveThemeBasemap(preferences.preferred_basemap, themeRef.current)
      setBasemapId(preferred)
      saveBasemapPreference(preferred)
    }).catch(() => undefined)
    const onPreferencesUpdated = (event: Event) => {
      const preferences = (event as CustomEvent<AccountPreferences>).detail
      accountPreferencesRef.current = preferences
      const preferred = resolveThemeBasemap(preferences.preferred_basemap, themeRef.current)
      setBasemapId(preferred)
      saveBasemapPreference(preferred)
      setBasemapNotice(null)
    }
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated)
    return () => { current = false; window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated) }
  }, [])

  useEffect(() => {
    if (basemapId !== 'cartavault-light' && basemapId !== 'cartavault-dark') return
    const explicitSelection = explicitBasemapSelectionRef.current
    if (explicitSelection === basemapId) {
      const explicitTheme = explicitSelection === 'cartavault-dark' ? 'dark' : 'light'
      if (explicitTheme !== resolvedTheme) return
      explicitBasemapSelectionRef.current = null
    }
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

  const selectBasemap = (id: BasemapId) => {
    const selected = resolveAvailableBasemapId(id)
    if (selected === 'cartavault-light') setThemePreference('light')
    if (selected === 'cartavault-dark') setThemePreference('dark')
    explicitBasemapSelectionRef.current = selected
    setBasemapId(selected)
    setBasemapNotice(null)
    tileFailuresRef.current.clear()
    failedBasemapsRef.current.clear()
    saveBasemapPreference(selected)
    const currentPreferences = accountPreferencesRef.current
    if (currentPreferences !== null && currentPreferences.preferred_basemap !== selected) {
      const updated = { ...currentPreferences, preferred_basemap: selected }
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
      className={`map-workspace${placeListOpen ? ' place-list-open' : ''}${sidebarOpen ? ' sidebar-open' : ''}`}
      style={{ '--cv-left-panel-width': `${leftPanelWidth}px`, '--cv-right-panel-width': `${rightPanelWidth}px` } as CSSProperties}
    >
      <MapMarkerFilterContext.Provider value={{ filter: markerFilter, setFilter: setMarkerFilter }}>{placeList}</MapMarkerFilterContext.Provider>
      {placeListOpen && <PanelResizeHandle side="left" width={leftPanelWidth} onResize={(width) => { setLeftPanelWidth(width); savePanelWidth(LEFT_PANEL_WIDTH_KEY, width) }} />}
      <div className="map-layout" aria-label="Carte des points d'intérêt">
        <PoiMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          initialView={initialView}
          onBoundsChange={onBoundsChange}
          onViewChange={onViewChange}
          onPlaceSelect={onPlaceSelect}
          focusRequest={focusRequest}
          layoutKey={`${placeListOpen}-${sidebarOpen}`}
          popupContent={popupContent}
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
          hiddenTripDayIds={hiddenTripDayIds}
          activeTripDayId={activeTripDayId}
          onTripPlaceAdd={onTripPlaceAdd}
        />
        {contextMenu && <MapContextMenu state={contextMenu} canCreate={canEdit} tripDays={onTripCoordinateAdd ? trip?.days.map((day) => ({ id: day.id, label: `Jour ${day.day_number}${day.title ? ` · ${day.title}` : ''}` })) : []} onAddToTripDay={onTripCoordinateAdd ? (dayId) => { const { latitude, longitude } = contextMenu; setContextMenu(null); onTripCoordinateAdd(dayId, latitude, longitude) } : undefined} onClose={() => setContextMenu(null)} onCreate={() => { const { latitude, longitude } = contextMenu; setContextMenu(null); onCreateFromCoordinates(latitude, longitude) }} onCopy={() => { void navigator.clipboard?.writeText(`${contextMenu.latitude.toFixed(6)}, ${contextMenu.longitude.toFixed(6)}`).then(() => setContextNotice('Coordonnées copiées')).catch(() => setContextNotice('Copie indisponible')); setContextMenu(null) }} />}
        {contextNotice && <p className="context-notice" role="status">{contextNotice}</p>}
        {tripNotice && <p className="context-notice trip-notice" role="status">{tripNotice}</p>}
        {mapNotice && <p className="map-results-notice" role="status">{mapNotice}</p>}
        {!tripViewOnly && <GeographicSearch focus={initialView.center} countryCode={activeCountryCode} selected={selectedSearchResult} canCreate={canEdit} onSelect={(result) => { setLocalSearchResult(result); onGeographicResultSelect(result) }} onClear={() => { setLocalSearchResult(null); onGeographicResultClear() }} onCreate={onCreateFromGeographicResult} />}
        <BasemapSelector activeBasemapId={basemapId} onBasemapChange={selectBasemap} />
        <StatusLegend statuses={statuses} />

        {basemapNotice && <div className="basemap-error" role="status">{basemapNotice}</div>}

        {isLoading && (
          <div className="status-banner loading-status" role="status">
            <span className="loading-dot" aria-hidden="true" />
            Chargement des POI…
          </div>
        )}

        {errorMessage !== null && (
          <div className="status-banner error-status" role="alert">
            <strong>Impossible de charger la carte.</strong>
            <span>{errorMessage}</span>
          </div>
        )}

      </div>
      {sidebar}
      {sidebarOpen && sidebarResizable && !tripViewOnly && <PanelResizeHandle side="right" width={rightPanelWidth} onResize={(width) => { setRightPanelWidth(width); savePanelWidth(RIGHT_PANEL_WIDTH_KEY, width) }} />}
    </section>
  )
}
