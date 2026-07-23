import { Mail, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { register } from '../api/registration'
import { useI18n } from '../i18n/useI18n'
import {
  AuthCard,
  AuthInput,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmitButton,
} from '../components/auth/AuthLayout'

export function RegisterPage() {
  const { locale, t } = useI18n()
  const [searchParams] = useSearchParams()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      await register(String(data.get('email')), String(data.get('password')), String(data.get('confirmation')), locale)
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.register.error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthCard
          title={t('auth.register.doneTitle')}
          subtitle={t('auth.register.doneSubtitle')}
          status="success"
          footer={<p>{t('auth.register.already')} <Link to="/">{t('auth.login.submit')}</Link></p>}
        >
          <div className="auth-confirmation" role="status">
            <p>{t('auth.register.doneDescription')}</p>
            <Link className="auth-secondary-link" to="/">{t('auth.register.backToLogin')}</Link>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t('auth.register.title')}
        subtitle={t('auth.register.subtitle')}
        footer={<p>{t('auth.register.already')} <Link to="/">{t('auth.login.submit')}</Link></p>}
      >
        <p className="auth-card__context">{t('auth.register.context')}</p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput label={t('auth.email')} icon={Mail} name="email" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} defaultValue={searchParams.get('email') ?? ''} required />
          <AuthPasswordInput label={t('auth.password')} name="password" autoComplete="new-password" placeholder={t('auth.password.minimum', { count: 12 })} required minLength={12} />
          <AuthPasswordInput label={t('auth.register.confirmPassword')} name="confirmation" autoComplete="new-password" placeholder={t('auth.register.confirmPlaceholder')} required minLength={12} />
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={busy}>
            <Send aria-hidden="true" />
            {busy ? t('auth.register.submitting') : t('auth.register.submit')}
          </AuthSubmitButton>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
