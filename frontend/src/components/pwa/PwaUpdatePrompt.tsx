import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { registerServiceWorker } from '../../pwa/serviceWorker'

export function PwaUpdatePrompt() {
  const { t } = useI18n()
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => registerServiceWorker(setRegistration), [])

  if (!registration?.waiting) return null

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <div>
        <strong>{t('pwa.update.title')}</strong>
        <span>{t('pwa.update.description')}</span>
      </div>
      <button type="button" onClick={() => registration.waiting?.postMessage({ type: 'SKIP_WAITING' })}>
        <RefreshCw size={16} aria-hidden="true" />
        {t('pwa.update.action')}
      </button>
    </aside>
  )
}
