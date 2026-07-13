import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

interface MapResizeWatcherProps {
  sidebarOpen: boolean
}

export function MapResizeWatcher({ sidebarOpen }: MapResizeWatcherProps) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize({ pan: false }), 220)
    return () => window.clearTimeout(timeout)
  }, [map, sidebarOpen])

  return null
}
