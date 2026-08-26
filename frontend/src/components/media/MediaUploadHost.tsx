import { useEffect, useState } from 'react'

import { MediaUploadDialog } from './MediaUploadDialog'
import type { PoiMap } from '../../types/map'

const OPEN_EVENT = 'cartavault:show-media-upload'

/**
 * Rendered beside the application shell, not inside it. This keeps the mobile
 * upload layer outside every scroll/overflow container used by the workspace.
 */
export function MediaUploadHost() {
  const [open, setOpen] = useState(false)
  const [maps, setMaps] = useState<PoiMap[]>([])

  useEffect(() => {
    const open = (event: Event) => {
      setMaps((event as CustomEvent<{ maps?: PoiMap[] }>).detail?.maps ?? [])
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  if (!open) return null
  return <MediaUploadDialog
    maps={maps}
    onClose={() => setOpen(false)}
    onDone={() => {
      window.dispatchEvent(new Event('cartavault:media-uploaded'))
      setOpen(false)
    }}
  />
}
