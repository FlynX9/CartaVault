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
    let frame: number | undefined
    const handleResize = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [map])

  useEffect(() => {
    const mapWithContainer = map as typeof map & { getContainer?: () => HTMLElement }
    const container = mapWithContainer.getContainer?.()
    if (!container || typeof ResizeObserver === 'undefined') return

    let frame: number | undefined
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [map])

  return null
}
