import { useState, type ReactNode } from 'react'

import { BasemapSelector } from '../components/map/BasemapSelector'
import { PoiMap } from '../components/map/PoiMap'
import { StatusLegend } from '../components/map/StatusLegend'
import { getBasemap, loadBasemapPreference, saveBasemapPreference, type BasemapId } from '../map/basemaps'
import type { MapBounds, MapFocusRequest, MapPlace, MapView } from '../types/place'
import type { PlaceStatusSummary } from '../types/status'

interface MapPageProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  sidebarOpen: boolean
  placeListOpen: boolean
  statuses: PlaceStatusSummary[]
  sidebar: ReactNode
  popupContent?: ReactNode
  placeList: ReactNode
  focusRequest: MapFocusRequest | null
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  onPopupClose?: () => void
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
  sidebar,
  popupContent = null,
  placeList,
  focusRequest,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  onPopupClose = () => undefined,
}: MapPageProps) {
  const [basemapId, setBasemapId] = useState(loadBasemapPreference)
  const [basemapError, setBasemapError] = useState(false)

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
      {placeList}
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
        />
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
