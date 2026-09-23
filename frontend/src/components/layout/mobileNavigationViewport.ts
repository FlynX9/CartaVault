import { useEffect, useState } from 'react'

export const MOBILE_NAVIGATION_MEDIA_QUERY = '(max-width: 760px)'

export function useMobileNavigationViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined'
    && window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches === true
  ))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY)
    const updateViewport = () => setIsMobile(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener?.('change', updateViewport)
    return () => mediaQuery.removeEventListener?.('change', updateViewport)
  }, [])

  return isMobile
}

export function closeMobileModalLayers() {
  if (window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches) {
    window.dispatchEvent(new Event('cartavault:close-mobile-modal-layers'))
  }
}
