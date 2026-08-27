import { useEffect, useRef, useState } from 'react'

import type { PoiMap } from '../../types/map'
import { useI18n } from '../../i18n/useI18n'
import { publishGlobalFeedback } from '../common/globalFeedback'
import { KmzImportDialog } from './KmzImportDialog'

export const OPEN_KMZ_IMPORT_EVENT = 'cartavault:show-kmz-import'
export const KMZ_IMPORTED_EVENT = 'cartavault:kmz-imported'

export function openKmzImport(poiMap: PoiMap) {
  window.dispatchEvent(new CustomEvent<{ poiMap: PoiMap }>(OPEN_KMZ_IMPORT_EVENT, {
    detail: { poiMap },
  }))
}

export function KmzImportHost() {
  const { t } = useI18n()
  const [poiMap, setPoiMap] = useState<PoiMap | null>(null)
  const [visible, setVisible] = useState(false)
  const activeRef = useRef(false)
  const trackingRef = useRef(false)
  const visibleRef = useRef(false)

  useEffect(() => {
    const open = (event: Event) => {
      if (activeRef.current) return
      const nextMap = (event as CustomEvent<{ poiMap?: PoiMap }>).detail?.poiMap
      if (!nextMap) return
      activeRef.current = true
      setPoiMap(nextMap)
      visibleRef.current = true
      setVisible(true)
    }
    window.addEventListener(OPEN_KMZ_IMPORT_EVENT, open)
    return () => window.removeEventListener(OPEN_KMZ_IMPORT_EVENT, open)
  }, [])

  if (!poiMap) return null
  return <KmzImportDialog
    poiMap={poiMap}
    hidden={!visible}
    onTaskStarted={() => {
      trackingRef.current = true
    }}
    onClose={() => {
      visibleRef.current = false
      setVisible(false)
      if (!trackingRef.current) {
        activeRef.current = false
        setPoiMap(null)
      }
    }}
    onImported={() => {
      window.dispatchEvent(new Event(KMZ_IMPORTED_EVENT))
      trackingRef.current = false
      if (!visibleRef.current) {
        publishGlobalFeedback('success', t('imports.kmz.completed'))
        activeRef.current = false
        setPoiMap(null)
      }
    }}
    onTaskFailed={(message) => {
      if (!visibleRef.current) publishGlobalFeedback('error', message)
      trackingRef.current = false
      if (!visibleRef.current) {
        activeRef.current = false
        setPoiMap(null)
      }
    }}
  />
}
