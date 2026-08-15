import { useEffect } from 'react'

import { resumeOfflineDownloads } from '../../pwa/offlineDownloadManager'

export function OfflineDownloadManager({ userId }: { userId: string }) {
  useEffect(() => {
    let disposed = false
    const resume = () => { if (!disposed) void resumeOfflineDownloads(userId).catch(() => undefined) }
    const resumeWhenVisible = () => { if (document.visibilityState === 'visible') resume() }
    resume()
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resumeWhenVisible)
    return () => {
      disposed = true
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resumeWhenVisible)
    }
  }, [userId])
  return null
}
