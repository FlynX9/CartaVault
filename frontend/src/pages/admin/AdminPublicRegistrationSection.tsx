import { useEffect, useState } from 'react'
import { IconCloudComputing } from '@tabler/icons-react'
import { Globe2, Mail } from 'lucide-react'

import { getPublicRegistrationSettings, updatePublicRegistrationSettings, type PublicRegistrationSettings } from '../../api/registration'
import { useI18n } from '../../i18n/useI18n'

export function AdminPublicRegistrationSection() {
  const { t } = useI18n()
  const [registration, setRegistration] = useState<PublicRegistrationSettings>({ enabled: false, approval_required: true })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getPublicRegistrationSettings(controller.signal)
      .then((settings) => { if (!controller.signal.aborted) setRegistration(settings) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t('admin.general.registrationLoadFailed'))
      })
    return () => controller.abort()
  }, [t])

  const updateRegistration = async (patch: Partial<PublicRegistrationSettings>) => {
    setError(null)
    setNotice(null)
    const changesRegistrationState = 'enabled' in patch
    try {
      setRegistration(await updatePublicRegistrationSettings({ ...registration, ...patch }))
      setNotice(t(changesRegistrationState ? 'admin.general.registrationUpdated' : 'admin.general.approvalUpdated'))
    } catch (reason) {
      const failure = t(changesRegistrationState ? 'admin.general.registrationUpdateFailed' : 'admin.general.approvalUpdateFailed')
      setError(reason instanceof Error ? `${failure} ${reason.message}` : failure)
    }
  }

  return <>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {notice && <div className="admin-success" role="status">{notice}</div>}
    <section className="admin-public-registration">
      <h3><IconCloudComputing size={18} aria-hidden="true" />{t('admin.general.publicRegistration')}</h3>
      <p>{t('admin.general.publicRegistrationDescription')}</p>
      <div>
        <Globe2 size={21} />
        <span><strong>{t('admin.general.enableRegistration')}</strong><small>{t('admin.general.enableRegistrationHelp')}</small></span>
        <label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.general.enableRegistration')} checked={registration.enabled} onChange={() => void updateRegistration({ enabled: !registration.enabled })} /><i /></label>
      </div>
      <div>
        <Mail size={21} />
        <span><strong>{t('admin.general.approval')}</strong><small>{t('admin.general.approvalHelp')}</small></span>
        <label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.general.approval')} disabled={!registration.enabled} checked={registration.approval_required} onChange={() => void updateRegistration({ approval_required: !registration.approval_required })} /><i /></label>
      </div>
    </section>
  </>
}
