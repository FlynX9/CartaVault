import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

export function MapDoubleClickZoomController({ disabled }: { disabled: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (disabled) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    return () => { if (disabled) map.doubleClickZoom.enable() }
  }, [disabled, map])

  return null
}
