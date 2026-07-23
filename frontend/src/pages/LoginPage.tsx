import { LogIn, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n/useI18n'
import {
  AuthCard,
  AuthInput,
  AuthLayout,
  AuthPasswordInput,
  AuthSecureNotice,
  AuthSubmitButton,
} from '../components/auth/AuthLayout'

const REMEMBERED_EMAIL_KEY = 'cartavault.auth.remembered-email'

function loadRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function LoginPage() {
  const { login } = useAuth()
  const { t } = useI18n()
  const rememberedEmail = loadRememberedEmail()
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(rememberedEmail !== '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login({ email, password })
      try {
        if (remember) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
        else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      } catch {
        // Authentication still succeeds when local storage is unavailable.
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.login.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t('auth.login.title')}
        subtitle={t('auth.login.subtitle')}
        footer={<p>{t('auth.login.noAccount')} <Link to="/register">{t('auth.login.createAccount')}</Link></p>}
      >
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput
            label={t('auth.email')}
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <AuthPasswordInput
            label={t('auth.password')}
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="auth-form__options">
            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>{t('auth.login.remember')}</span>
            </label>
            <Link to="/forgot-password">{t('auth.login.forgot')}</Link>
          </div>
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={submitting}>
            <LogIn aria-hidden="true" />
            {submitting ? t('auth.login.submitting') : t('auth.login.submit')}
          </AuthSubmitButton>
        </form>
        <AuthSecureNotice />
      </AuthCard>
    </AuthLayout>
  )
}
