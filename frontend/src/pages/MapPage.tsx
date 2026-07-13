import type { ReactNode } from 'react'

import { PoiMap } from '../components/map/PoiMap'
import type { MapBounds, MapFocusRequest, MapPlace, MapView } from '../types/place'

interface MapPageProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  sidebarOpen: boolean
  placeListOpen: boolean
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
  sidebar,
  popupContent = null,
  placeList,
  focusRequest,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  onPopupClose = () => undefined,
}: MapPageProps) {
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
        />

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
