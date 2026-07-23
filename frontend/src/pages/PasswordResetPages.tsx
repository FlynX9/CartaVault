import { ArrowLeft, KeyRound, Mail, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { confirmPasswordReset, requestPasswordReset } from '../api/registration'
import { useI18n } from '../i18n/useI18n'
import {
  AuthCard,
  AuthInput,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmitButton,
} from '../components/auth/AuthLayout'

export function ForgotPasswordPage() {
  const { locale, t } = useI18n()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await requestPasswordReset(String(new FormData(event.currentTarget).get('email')), locale)
      setMessage(response.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.reset.requestError'))
    } finally {
      setBusy(false)
    }
  }

  if (message) {
    return (
      <AuthLayout>
        <AuthCard
          title={t('auth.reset.checkEmailTitle')}
          subtitle={t('auth.reset.checkEmailSubtitle')}
          status="success"
          footer={<p><Link to="/">{t('auth.register.backToLogin')}</Link></p>}
        >
          <div className="auth-confirmation" role="status">
            <p>{message}</p>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t('auth.reset.forgotTitle')}
        subtitle={t('auth.reset.forgotSubtitle')}
        footer={<p><Link to="/"><ArrowLeft aria-hidden="true" /> {t('auth.register.backToLogin')}</Link></p>}
      >
        <p className="auth-card__context">{t('auth.reset.context')}</p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput label={t('auth.email')} icon={Mail} name="email" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} required />
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={busy}>
            <Send aria-hidden="true" />
            {busy ? t('auth.reset.sending') : t('auth.reset.send')}
          </AuthSubmitButton>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      await confirmPasswordReset(token, String(data.get('password')), String(data.get('confirmation')))
      setDone(true)
      window.history.replaceState({}, '', '/reset-password')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.reset.error'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthCard
          title={t('auth.reset.doneTitle')}
          subtitle={t('auth.reset.doneSubtitle')}
          status="success"
          footer={<p><Link to="/">{t('auth.reset.login')}</Link></p>}
        >
          <div className="auth-confirmation" role="status">
            <p>{t('auth.reset.doneDescription')}</p>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t('auth.reset.newTitle')}
        subtitle={t('auth.reset.newSubtitle')}
        footer={<p><Link to="/"><ArrowLeft aria-hidden="true" /> {t('auth.register.backToLogin')}</Link></p>}
      >
        {!token ? (
          <div className="auth-alert" role="alert">{t('auth.reset.invalidLink')}</div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <AuthPasswordInput label={t('auth.reset.newPassword')} name="password" autoComplete="new-password" placeholder={t('auth.password.minimum', { count: 12 })} required minLength={12} />
            <AuthPasswordInput label={t('auth.register.confirmPassword')} name="confirmation" autoComplete="new-password" placeholder={t('auth.register.confirmPlaceholder')} required minLength={12} />
            {error && <p className="auth-alert" role="alert">{error}</p>}
            <AuthSubmitButton disabled={busy}>
              <KeyRound aria-hidden="true" />
              {busy ? t('auth.reset.submitting') : t('auth.reset.submit')}
            </AuthSubmitButton>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  )
}
