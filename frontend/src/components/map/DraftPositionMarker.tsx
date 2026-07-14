import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import { Marker } from 'react-leaflet'

import type { DraftPosition } from '../../types/place'

const draftPositionIcon = divIcon({
  className: 'draft-position-marker-container',
  html: '<span class="draft-position-marker" aria-hidden="true">⌖</span>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

interface Props {
  position: DraftPosition
  onPositionChange: (position: DraftPosition) => void
}

export function DraftPositionMarker({ position, onPositionChange }: Props) {
  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={draftPositionIcon}
      draggable
      title="Position du POI en cours d’édition"
      alt="Position du POI en cours d’édition"
      eventHandlers={{
        dragend: (event) => {
          const nextPosition = (event.target as LeafletMarker).getLatLng()
          onPositionChange({ latitude: nextPosition.lat, longitude: nextPosition.lng })
        },
      }}
    />
  )
}
