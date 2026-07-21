import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

interface MapResizeWatcherProps {
  layoutKey: string
}

export function MapResizeWatcher({ layoutKey }: MapResizeWatcherProps) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize({ pan: false }), 220)
    return () => window.clearTimeout(timeout)
  }, [layoutKey, map])

  useEffect(() => {
    let timeout: number | undefined
    const handleResize = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => map.invalidateSize({ pan: false }), 120)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.clearTimeout(timeout)
    }
  }, [map])

  useEffect(() => {
    const mapWithContainer = map as typeof map & { getContainer?: () => HTMLElement }
    const container = mapWithContainer.getContainer?.()
    if (!container || typeof ResizeObserver === 'undefined') return

    let timeout: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => map.invalidateSize({ pan: false }), 120)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [map])

  return null
}
