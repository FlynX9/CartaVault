import { PoiMap } from '../components/map/PoiMap'
import { PlacePreview } from '../components/places/PlacePreview'
import type { MapBounds, MapPlace, MapView } from '../types/place'

interface MapPageProps {
  places: MapPlace[]
  selectedPlace: MapPlace | null
  initialView: MapView
  isLoading: boolean
  errorMessage: string | null
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  onPlaceClose: () => void
}

export function MapPage({
  places,
  selectedPlace,
  initialView,
  isLoading,
  errorMessage,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  onPlaceClose,
}: MapPageProps) {
  return (
    <section className="map-layout" aria-label="Carte des points d'intérêt">
      <PoiMap
        places={places}
        selectedPlaceId={selectedPlace?.id ?? null}
        initialView={initialView}
        onBoundsChange={onBoundsChange}
        onViewChange={onViewChange}
        onPlaceSelect={onPlaceSelect}
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

      {selectedPlace !== null && (
        <PlacePreview place={selectedPlace} onClose={onPlaceClose} />
      )}
    </section>
  )
}
