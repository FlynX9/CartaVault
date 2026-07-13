import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import { defaultMarkerIcon } from './markerIcons'

interface LocationPickerProps {
  latitude: number | null
  longitude: number | null
  onChange: (latitude: number, longitude: number) => void
}

function MapInteraction({ latitude, longitude, onChange }: LocationPickerProps) {
  const map = useMap()
  useMapEvents({ click: (event) => onChange(event.latlng.lat, event.latlng.lng) })

  useEffect(() => {
    if (latitude !== null && longitude !== null) map.panTo([latitude, longitude])
  }, [latitude, longitude, map])

  if (latitude === null || longitude === null) return null
  return (
    <Marker
      position={[latitude, longitude]}
      icon={defaultMarkerIcon}
      draggable
      eventHandlers={{
        dragend: (event) => {
          const position = event.target.getLatLng()
          onChange(position.lat, position.lng)
        },
      }}
    />
  )
}

export function LocationPicker(props: LocationPickerProps) {
  const center: [number, number] =
    props.latitude !== null && props.longitude !== null
      ? [props.latitude, props.longitude]
      : [48.17, 6.45]

  return (
    <MapContainer center={center} zoom={9} className="location-picker">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapInteraction {...props} />
    </MapContainer>
  )
}
