import { Icon, LatLngBounds } from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'

import type { MapBounds, MapPlace } from '../../types/place'
import { MapBoundsWatcher } from './MapBoundsWatcher'

const INITIAL_POSITION: [number, number] = [48.17, 6.45]
const WORLD_BOUNDS = new LatLngBounds([-90, -180], [90, 180])

const defaultMarkerIcon = new Icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const selectedMarkerIcon = new Icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [31, 51],
  iconAnchor: [15, 51],
  shadowSize: [46, 46],
})

interface PoiMapProps {
  places: MapPlace[]
  selectedPlaceId: string | null
  onBoundsChange: (bounds: MapBounds) => void
  onPlaceSelect: (place: MapPlace) => void
}

export function PoiMap({
  places,
  selectedPlaceId,
  onBoundsChange,
  onPlaceSelect,
}: PoiMapProps) {
  return (
    <MapContainer
      center={INITIAL_POSITION}
      zoom={9}
      minZoom={2}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1}
      className="poi-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapBoundsWatcher onBoundsChange={onBoundsChange} />

      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.latitude, place.longitude]}
          icon={
            place.id === selectedPlaceId
              ? selectedMarkerIcon
              : defaultMarkerIcon
          }
          eventHandlers={{
            click: () => onPlaceSelect(place),
          }}
          title={place.name}
        />
      ))}
    </MapContainer>
  )
}
