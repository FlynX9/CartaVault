import { useMapEvents } from 'react-leaflet'

import type { MapContextMenuState } from './mapContextMenuUtils'

export function MapContextEvents({ onOpen, onClose, onMapClick = () => undefined }: { onOpen: (state: MapContextMenuState) => void; onClose: () => void; onMapClick?: () => void }) {
  useMapEvents({
    contextmenu: (event) => {
      event.originalEvent.preventDefault()
      onOpen({ latitude: event.latlng.lat, longitude: event.latlng.lng, containerX: event.containerPoint.x, containerY: event.containerPoint.y })
    },
    click: (event) => {
      const target = event.originalEvent.target
      if (target instanceof Element && target.closest('.place-annotation-shape, .place-annotation-halo')) return
      onClose()
      onMapClick()
    },
    movestart: onClose,
    zoomstart: onClose,
  })
  return null
}
