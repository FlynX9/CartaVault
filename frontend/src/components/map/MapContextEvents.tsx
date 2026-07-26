import { useMapEvents } from 'react-leaflet'

import type { MapContextMenuState } from './mapContextMenuUtils'

export function MapContextEvents({ onOpen, onClose, onMapClick = () => undefined }: { onOpen: (state: MapContextMenuState) => void; onClose: () => void; onMapClick?: () => void }) {
  useMapEvents({
    contextmenu: (event) => {
      event.originalEvent.preventDefault()
      onOpen({ latitude: event.latlng.lat, longitude: event.latlng.lng, containerX: event.containerPoint.x, containerY: event.containerPoint.y })
    },
    click: () => {
      onClose()
      onMapClick()
    },
    movestart: onClose,
    zoomstart: onClose,
  })
  return null
}
