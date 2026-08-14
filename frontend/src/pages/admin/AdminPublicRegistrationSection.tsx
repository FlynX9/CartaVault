import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconCloudComputing } from '@tabler/icons-react'

import { getPublicRegistrationSettings, updatePublicRegistrationSettings, type PublicRegistrationSettings } from '../../api/registration'
import { useI18n } from '../../i18n/useI18n'
import { useAdminSaveEntry, type AdminSaveEntry } from './adminSaveContext'

export function AdminPublicRegistrationSection() {
  const { t } = useI18n()
  const [registration, setRegistration] = useState<PublicRegistrationSettings>({ enabled: false, approval_required: true })
  const [savedRegistration, setSavedRegistration] = useState<PublicRegistrationSettings>({ enabled: false, approval_required: true })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getPublicRegistrationSettings(controller.signal)
      .then((settings) => { if (!controller.signal.aborted) { setRegistration(settings); setSavedRegistration(settings) } })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('admin.general.registrationLoadFailed'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [t])

  const updateRegistration = (patch: Partial<PublicRegistrationSettings>) => {
    setError(null)
    setRegistration((current) => ({ ...current, ...patch }))
  }
  const save = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updatePublicRegistrationSettings(registration)
      setRegistration(updated)
      setSavedRegistration(updated)
    } catch (reason) {
      const failure = t('admin.general.registrationUpdateFailed')
      setError(reason instanceof Error ? `${failure} ${reason.message}` : failure)
      throw reason
    } finally { setBusy(false) }
  }, [registration, t])
  const saveEntry = useMemo<AdminSaveEntry>(() => ({
    label: t('admin.general.publicRegistration'),
    dirty: registration.enabled !== savedRegistration.enabled || registration.approval_required !== savedRegistration.approval_required,
    busy,
    save,
    discard: () => { setRegistration(savedRegistration); setError(null) },
  }), [busy, registration, save, savedRegistration, t])
  useAdminSaveEntry('general-public-registration', saveEntry)

  return <>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="admin-public-registration">
      <header className="admin-console__setting-header">
        <span className="admin-console__setting-icon"><IconCloudComputing size={17} aria-hidden="true" /></span>
        <div><h3>{t('admin.general.publicRegistration')}</h3><p>{t('admin.general.publicRegistrationDescription')}</p></div>
      </header>
      <div>
        <span><strong>{t('admin.general.enableRegistration')}</strong><small>{t('admin.general.enableRegistrationHelp')}</small></span>
        <label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.general.enableRegistration')} checked={registration.enabled} disabled={loading || busy} onChange={() => updateRegistration({ enabled: !registration.enabled })} /><i /></label>
      </div>
      <div>
        <span><strong>{t('admin.general.approval')}</strong><small>{t('admin.general.approvalHelp')}</small></span>
        <label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.general.approval')} disabled={loading || busy || !registration.enabled} checked={registration.approval_required} onChange={() => updateRegistration({ approval_required: !registration.approval_required })} /><i /></label>
      </div>
    </section>
  </>
}
