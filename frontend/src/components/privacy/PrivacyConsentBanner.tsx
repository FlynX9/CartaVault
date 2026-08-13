import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

import { getPrivacyConfiguration, getPrivacyConsent, savePrivacyConsent, type PrivacyConsent } from '../../api/privacy'
import { useI18n } from '../../i18n/useI18n'

const rejected: Pick<PrivacyConsent, 'analytics' | 'functional_optional' | 'marketing' | 'third_party'> = { analytics: false, functional_optional: false, marketing: false, third_party: false }

export function PrivacyConsentBanner() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getPrivacyConfiguration(controller.signal), getPrivacyConsent(controller.signal)])
      .then(([configuration, consent]) => {
        if (controller.signal.aborted || !configuration.consent_required) return
        setAnalytics(consent.analytics)
        setOpen(consent.version !== configuration.consent_version || consent.updated_at === null)
      })
      .catch(() => { /* Consent is not required until the configuration is available. */ })
    return () => controller.abort()
  }, [])

  const persist = async (value: Pick<PrivacyConsent, 'analytics' | 'functional_optional' | 'marketing' | 'third_party'>) => {
    setSaving(true)
    try { await savePrivacyConsent(value); setOpen(false) }
    finally { setSaving(false) }
  }

  const acceptAll = { analytics: true, functional_optional: true, marketing: true, third_party: true }

  if (!open) return null
  return <aside className="privacy-consent-banner" role="dialog" aria-modal="false" aria-labelledby="privacy-consent-title">
    <div><ShieldCheck size={20} /><div><h2 id="privacy-consent-title">{t('account.privacyBanner.title')}</h2><p>{t('account.privacyBanner.description')}</p></div></div>
    {details && <label className="privacy-consent-banner__choice"><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />{t('account.privacyBanner.analytics')}</label>}
    <footer><button type="button" className="account-button account-button--secondary" disabled={saving} onClick={() => void persist(rejected)}>{t('account.privacyBanner.reject')}</button><button type="button" className="account-button account-button--secondary" disabled={saving} onClick={() => setDetails((value) => !value)}>{details ? t('account.privacyBanner.hideDetails') : t('account.privacyBanner.customize')}</button><button type="button" className="account-button account-button--primary" disabled={saving} onClick={() => void persist(details ? { ...rejected, analytics } : acceptAll)}>{details ? t('account.privacyBanner.saveChoices') : t('account.privacyBanner.accept')}</button></footer>
    <button type="button" className="privacy-consent-banner__close" aria-label={t('account.privacyBanner.close')} disabled={saving} onClick={() => void persist(rejected)}><X size={15} /></button>
  </aside>
}
