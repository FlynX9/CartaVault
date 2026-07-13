import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PoiMap } from '../components/map/PoiMap'
import type { MapBounds, MapPlace, MapView } from '../types/place'

interface MapPageProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  sidebarOpen: boolean
  sidebar: ReactNode
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
}

export function MapPage({
  places,
  selectedPlaceId,
  initialView,
  isLoading,
  errorMessage,
  sidebarOpen,
  sidebar,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
}: MapPageProps) {
  return (
    <section className={`map-workspace${sidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="map-layout" aria-label="Carte des points d'intérêt">
        <Link className="map-create-button" to="/places/new">
          + Ajouter un POI
        </Link>

        <PoiMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          initialView={initialView}
          onBoundsChange={onBoundsChange}
          onViewChange={onViewChange}
          onPlaceSelect={onPlaceSelect}
          sidebarOpen={sidebarOpen}
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
