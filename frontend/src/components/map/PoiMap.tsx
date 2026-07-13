import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { LatLngBounds, Marker as LeafletMarker, Popup as LeafletPopup } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'

import type { MapBounds, MapFocusRequest, MapPlace, MapView } from '../../types/place'
import { MapBoundsWatcher } from './MapBoundsWatcher'
import { MapFocusController } from './MapFocusController'
import { MapResizeWatcher } from './MapResizeWatcher'
import { getStatusMarkerIcon } from './markerIcons'

const WORLD_BOUNDS = new LatLngBounds([-90, -180], [90, 180])

interface PoiMapProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  initialView: MapView
  onBoundsChange: (bounds: MapBounds) => void
  onViewChange: (view: MapView) => void
  onPlaceSelect: (place: MapPlace) => void
  focusRequest: MapFocusRequest | null
  layoutKey: string
  popupContent: ReactNode
  onPopupClose: () => void
}

function PlaceMarker({ place, selected, popupContent, onSelect, onPopupClose }: { place: MapPlace; selected: boolean; popupContent: ReactNode; onSelect: () => void; onPopupClose: () => void }) {
  const markerRef = useRef<LeafletMarker>(null)
  const popupRef = useRef<LeafletPopup>(null)
  const popupOpenedRef = useRef(false)
  const controlledCloseRef = useRef(false)

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!selected && popup !== null && popupOpenedRef.current) {
      controlledCloseRef.current = true
      popup.close()
    }
  }, [selected])

  useEffect(() => {
    const marker = markerRef.current
    const popup = popupRef.current
    if (selected && marker !== null && popup !== null && marker.getPopup() === popup) {
      marker.openPopup()
      if (marker.isPopupOpen()) {
        popupOpenedRef.current = true
      }
    }
  }, [selected])

  return (
    <Marker
      ref={markerRef}
      position={[place.latitude, place.longitude]}
      icon={getStatusMarkerIcon(place.status.color, selected)}
      eventHandlers={{
        click: onSelect,
        popupopen: () => { popupOpenedRef.current = true },
        popupclose: () => {
          const controlledClose = controlledCloseRef.current
          popupOpenedRef.current = false
          controlledCloseRef.current = false
          if (!controlledClose && selected) {
            onPopupClose()
          }
        },
      }}
      title={place.name}
    >
      <Popup
        ref={popupRef}
        autoPan={false}
        closeOnClick
        maxWidth={430}
        minWidth={300}
        closeButton={false}
      >
        {selected && popupContent ? popupContent : <p className="place-popup-loading">Chargement…</p>}
      </Popup>
    </Marker>
  )
}

export function PoiMap({
  places,
  selectedPlaceId,
  initialView,
  onBoundsChange,
  onViewChange,
  onPlaceSelect,
  focusRequest,
  layoutKey,
  popupContent,
  onPopupClose,
}: PoiMapProps) {
  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      minZoom={2}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      className="poi-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapBoundsWatcher
        onBoundsChange={onBoundsChange}
        onViewChange={onViewChange}
      />
      <MapFocusController request={focusRequest} />
      <MapResizeWatcher layoutKey={layoutKey} />

      {places.map((place) => <PlaceMarker key={place.id} place={place} selected={place.id === selectedPlaceId} popupContent={place.id === selectedPlaceId ? popupContent : null} onSelect={() => onPlaceSelect(place)} onPopupClose={onPopupClose} />)}
    </MapContainer>
  )
}
