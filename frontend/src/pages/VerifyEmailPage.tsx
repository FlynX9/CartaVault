import { CircleAlert, CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { verifyRegistrationEmail } from '../api/registration'
import { AuthCard, AuthLayout } from '../components/auth/AuthLayout'
import { useI18n } from '../i18n/useI18n'

export function VerifyEmailPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = searchParams.get('token') ?? ''
    if (token.length < 32) {
      setState('error')
      setMessage(t('auth.verify.invalid'))
      return
    }
    void verifyRegistrationEmail(token)
      .then((result) => { setState('success'); setMessage(result.message) })
      .catch((reason: unknown) => { setState('error'); setMessage(reason instanceof Error ? reason.message : t('auth.verify.invalid')) })
  }, [searchParams, t])

  const title = state === 'loading' ? t('auth.verify.loadingTitle') : state === 'success' ? t('auth.verify.successTitle') : t('auth.verify.errorTitle')
  const subtitle = state === 'loading' ? t('auth.verify.loadingSubtitle') : state === 'success' ? t('auth.verify.successSubtitle') : t('auth.verify.errorSubtitle')
  return <AuthLayout><AuthCard title={title} subtitle={subtitle} status={state === 'success' ? 'success' : undefined} footer={<p><Link to="/login">{t('auth.register.backToLogin')}</Link></p>}>
    <div className={`auth-confirmation${state === 'error' ? ' auth-confirmation--error' : ''}`} role="status">
      {state === 'success' ? <CircleCheck aria-hidden="true" /> : state === 'error' ? <CircleAlert aria-hidden="true" /> : null}
      <p>{message || t('auth.verify.loadingDescription')}</p>
    </div>
  </AuthCard></AuthLayout>
}
