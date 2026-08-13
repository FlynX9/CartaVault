import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, ShieldCheck } from 'lucide-react'

import { downloadPersonalData, getPrivacyConfiguration, getPrivacyConsent, savePrivacyConsent, type PrivacyConsent, type PrivacySettings } from '../../api/privacy'
import { useI18n } from '../../i18n/useI18n'

const initialConsent: PrivacyConsent = { necessary: true, analytics: false, functional_optional: false, marketing: false, third_party: false, version: '1', updated_at: null }

function download(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'cartavault-personal-data.zip'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function PrivacySection() {
  const { t } = useI18n()
  const [configuration, setConfiguration] = useState<PrivacySettings | null>(null)
  const [consent, setConsent] = useState<PrivacyConsent>(initialConsent)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getPrivacyConfiguration(controller.signal), getPrivacyConsent(controller.signal)])
      .then(([settings, storedConsent]) => { if (!controller.signal.aborted) { setConfiguration(settings); setConsent(storedConsent) } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('account.privacySection.loadError')) })
    return () => controller.abort()
  }, [])

  const saveConsent = async () => {
    setBusy(true); setError(null); setMessage(null)
    try { setConsent(await savePrivacyConsent(consent)); setMessage(t('account.privacySection.choicesSaved')) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('account.privacySection.saveError')) }
    finally { setBusy(false) }
  }
  const exportData = async () => {
    setBusy(true); setError(null); setMessage(null)
    try { download(await downloadPersonalData()); setMessage(t('account.privacySection.exportReady')) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('account.privacySection.exportError')) }
    finally { setBusy(false) }
  }

  return <section className="account-privacy">
    <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">{t('account.privacySection.eyebrow')}</p><h2>{t('account.privacySection.title')}</h2><span>{t('account.privacySection.description')}</span></header>
    {error && <p className="form-alert" role="alert">{error}</p>}{message && <p className="account-success" role="status">{message}</p>}
    <section className="account-preference-card account-privacy__card">
      <header className="account-preference-card__heading"><span className="account-preference-card__icon"><ShieldCheck size={19} /></span><div><h3>{t('account.privacySection.cookiesTitle')}</h3><p>{t('account.privacySection.cookiesDescription')}</p></div></header>
      {configuration?.consent_required ? <><p className="account-card-description">{t('account.privacySection.consentDescription')}</p><fieldset className="account-privacy__choices"><legend>{t('account.privacySection.choices')}</legend><label><input type="checkbox" checked={consent.analytics} onChange={(event) => setConsent({ ...consent, analytics: event.target.checked })} />{t('account.privacySection.analytics')}</label><label><input type="checkbox" checked={consent.functional_optional} onChange={(event) => setConsent({ ...consent, functional_optional: event.target.checked })} />{t('account.privacySection.functional')}</label><label><input type="checkbox" checked={consent.third_party} onChange={(event) => setConsent({ ...consent, third_party: event.target.checked })} />{t('account.privacySection.thirdParty')}</label><label><input type="checkbox" checked={consent.marketing} onChange={(event) => setConsent({ ...consent, marketing: event.target.checked })} />{t('account.privacySection.marketing')}</label></fieldset><button type="button" className="account-button account-button--primary" disabled={busy} onClick={() => void saveConsent()}>{t('account.privacySection.saveChoices')}</button></> : <p className="account-card-description">{t('account.privacySection.noConsentRequired')}</p>}
      <div className="account-privacy__links">{configuration?.privacy_policy_url && <a href={configuration.privacy_policy_url} target="_blank" rel="noreferrer"><FileText size={15} />{t('account.privacySection.privacyPolicy')}<ExternalLink size={13} /></a>}{configuration?.cookie_policy_url && <a href={configuration.cookie_policy_url} target="_blank" rel="noreferrer"><FileText size={15} />{t('account.privacySection.cookiePolicy')}<ExternalLink size={13} /></a>}{configuration?.contact_email && <a href={`mailto:${configuration.contact_email}`}><ExternalLink size={15} />{t('account.privacySection.contact', { operator: configuration.operator_name || t('account.privacySection.operator') })}</a>}</div>
    </section>
    <section className="account-preference-card account-privacy__card"><header className="account-preference-card__heading"><span className="account-preference-card__icon"><Download size={19} /></span><div><h3>{t('account.privacySection.dataTitle')}</h3><p>{t('account.privacySection.dataDescription')}</p></div></header><p className="account-card-description">{t('account.privacySection.exportDescription')}</p><button type="button" className="account-button account-button--secondary" disabled={busy} onClick={() => void exportData()}><Download size={15} />{t('account.privacySection.download')}</button></section>
  </section>
}
