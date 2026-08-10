import { useEffect, useState } from 'react'

import type { PoiMap } from '../../types/map'
import { MediaUploadDialog } from './MediaUploadDialog'

const OPEN_EVENT = 'cartavault:show-media-upload'

interface OpenMediaUploadDetail { maps?: PoiMap[] }

/**
 * Rendered beside the application shell, not inside it. This keeps the mobile
 * upload layer outside every scroll/overflow container used by the workspace.
 */
export function MediaUploadHost() {
  const [maps, setMaps] = useState<PoiMap[] | null>(null)

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<OpenMediaUploadDetail>).detail
      setMaps(Array.isArray(detail?.maps) ? detail.maps : [])
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  if (maps === null) return null
  return <MediaUploadDialog
    maps={maps}
    onClose={() => setMaps(null)}
    onDone={() => {
      window.dispatchEvent(new Event('cartavault:media-uploaded'))
      setMaps(null)
    }}
  />
}
