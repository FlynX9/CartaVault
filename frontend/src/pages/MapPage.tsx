import { useEffect, useState, type ReactNode } from 'react'

import { BasemapSelector } from '../components/map/BasemapSelector'
import { ACCOUNT_PREFERENCES_UPDATED_EVENT, getAccountPreferences } from '../api/account'
import { GeographicSearch } from '../components/geocoding/GeographicSearch'
import { MapContextMenu } from '../components/map/MapContextMenu'
import type { MapContextMenuState } from '../components/map/mapContextMenuUtils'
import { PoiMap } from '../components/map/PoiMap'
import { StatusLegend } from '../components/map/StatusLegend'
import { EMPTY_MAP_MARKER_FILTER, MapMarkerFilterContext, type MapMarkerFilter } from '../components/map/mapMarkerFilterContext'
import { getBasemap, loadBasemapPreference, parseBasemapId, saveBasemapPreference, type BasemapId } from '../map/basemaps'
import type { AccountPreferences } from '../types/account'
import type { DraftPosition, MapBounds, MapFocusRequest, MapPlace, MapView } from '../types/place'
import type { PlaceStatusSummary } from '../types/status'
import type { GeocodingResult } from '../geocoding/types'
import type { Trip } from '../types/trip'

interface MapPageProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  sidebarOpen: boolean
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
  sidebarOpen,
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
  activeTripDayId = null,
  onTripPlaceAdd,
  tripNotice = null,
  onTripCoordinateAdd,
}: MapPageProps) {
  const [basemapId, setBasemapId] = useState(loadBasemapPreference)
  const [basemapError, setBasemapError] = useState(false)
  const [localSearchResult, setLocalSearchResult] = useState<GeocodingResult | null>(null)
  const [contextMenu, setContextMenu] = useState<MapContextMenuState | null>(null)
  const [contextNotice, setContextNotice] = useState<string | null>(null)
  const [markerFilter, setMarkerFilter] = useState<MapMarkerFilter>(EMPTY_MAP_MARKER_FILTER)
  const selectedSearchResult = temporarySearchResult ?? localSearchResult

  useEffect(() => {
    let current = true
    void getAccountPreferences().then((preferences) => {
      const preferred = parseBasemapId(preferences.preferred_basemap)
      if (current && preferred) setBasemapId(preferred)
    }).catch(() => undefined)
    const onPreferencesUpdated = (event: Event) => {
      const preferred = parseBasemapId((event as CustomEvent<AccountPreferences>).detail.preferred_basemap)
      if (preferred) setBasemapId(preferred)
    }
    window.addEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated)
    return () => { current = false; window.removeEventListener(ACCOUNT_PREFERENCES_UPDATED_EVENT, onPreferencesUpdated) }
  }, [])

  const selectBasemap = (id: BasemapId) => {
    setBasemapId(id)
    setBasemapError(false)
    saveBasemapPreference(id)
  }

  const handleBasemapTileError = () => {
    if (getBasemap(basemapId).requiresStadiaAuthentication) setBasemapError(true)
  }

  return (
    <section
      className={`map-workspace${placeListOpen ? ' place-list-open' : ''}${sidebarOpen ? ' sidebar-open' : ''}`}
    >
      <MapMarkerFilterContext.Provider value={{ filter: markerFilter, setFilter: setMarkerFilter }}>{placeList}</MapMarkerFilterContext.Provider>
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
          activeTripDayId={activeTripDayId}
          onTripPlaceAdd={onTripPlaceAdd}
        />
        {contextMenu && <MapContextMenu state={contextMenu} canCreate={canEdit} tripDays={onTripCoordinateAdd ? trip?.days.map((day) => ({ id: day.id, label: `Jour ${day.day_number}${day.title ? ` · ${day.title}` : ''}` })) : []} onAddToTripDay={onTripCoordinateAdd ? (dayId) => { const { latitude, longitude } = contextMenu; setContextMenu(null); onTripCoordinateAdd(dayId, latitude, longitude) } : undefined} onClose={() => setContextMenu(null)} onCreate={() => { const { latitude, longitude } = contextMenu; setContextMenu(null); onCreateFromCoordinates(latitude, longitude) }} onCopy={() => { void navigator.clipboard?.writeText(`${contextMenu.latitude.toFixed(6)}, ${contextMenu.longitude.toFixed(6)}`).then(() => setContextNotice('Coordonnées copiées')).catch(() => setContextNotice('Copie indisponible')); setContextMenu(null) }} />}
        {contextNotice && <p className="context-notice" role="status">{contextNotice}</p>}
        {tripNotice && <p className="context-notice trip-notice" role="status">{tripNotice}</p>}
        <GeographicSearch focus={initialView.center} countryCode={activeCountryCode} selected={selectedSearchResult} canCreate={canEdit} onSelect={(result) => { setLocalSearchResult(result); onGeographicResultSelect(result) }} onClear={() => { setLocalSearchResult(null); onGeographicResultClear() }} onCreate={onCreateFromGeographicResult} />
        <BasemapSelector activeBasemapId={basemapId} onBasemapChange={selectBasemap} />
        <StatusLegend statuses={statuses} />

        {basemapError && (
          <div className="basemap-error" role="alert">
            <span>Le fond Stadia Maps est indisponible. Vérifiez la configuration ou utilisez OpenStreetMap.</span>
            <button type="button" onClick={() => selectBasemap('osm')}>Utiliser OSM</button>
          </div>
        )}

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
    </section>
  )
}
