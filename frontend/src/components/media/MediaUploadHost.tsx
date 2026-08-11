import { useEffect, useState } from 'react'

import { MediaUploadDialog } from './MediaUploadDialog'

const OPEN_EVENT = 'cartavault:show-media-upload'

/**
 * Rendered beside the application shell, not inside it. This keeps the mobile
 * upload layer outside every scroll/overflow container used by the workspace.
 */
export function MediaUploadHost() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const open = () => {
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => window.removeEventListener(OPEN_EVENT, open)
  }, [])

  if (!open) return null
  return <MediaUploadDialog
    onClose={() => setOpen(false)}
    onDone={() => {
      window.dispatchEvent(new Event('cartavault:media-uploaded'))
      setOpen(false)
    }}
  />
}
