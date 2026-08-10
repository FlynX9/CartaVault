import { KeyRound, LogIn, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { getPublicRegistrationStatus } from '../api/registration'
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
  const { user, loading, login, completeTotpLogin, completeEmailMfaLogin } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const rememberedEmail = loadRememberedEmail()
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(rememberedEmail !== '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null)
  const [emailMfaChallenge, setEmailMfaChallenge] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void getPublicRegistrationStatus(controller.signal).then((result) => setRegistrationEnabled(result.enabled)).catch(() => setRegistrationEnabled(false))
    return () => controller.abort()
  }, [])

  if (loading) {
    return <main className="auth-loading" aria-live="polite">Chargement de CartaVault…</main>
  }
  if (user) return <Navigate to="/dashboard" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const challenge = await login({ email, password })
      if (challenge) { if ('requires_email_mfa' in challenge) setEmailMfaChallenge(challenge.challenge_token); else setTotpChallenge(challenge.challenge_token); setPassword(''); return }
      navigate('/dashboard', { replace: true })
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

  const verifySecondFactor = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(null)
    try { if (emailMfaChallenge) await completeEmailMfaLogin(emailMfaChallenge, totpCode); else await completeTotpLogin(totpChallenge ?? '', totpCode, recoveryMode); navigate('/dashboard', { replace: true }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('auth.login.error')) }
    finally { setSubmitting(false) }
  }

  return (
    <AuthLayout>
      <AuthCard
        title={t('auth.login.title')}
        subtitle={t('auth.login.subtitle')}
        footer={registrationEnabled ? <p>{t('auth.login.noAccount')} <Link to="/register">{t('auth.login.createAccount')}</Link></p> : undefined}
      >
        {(totpChallenge || emailMfaChallenge) ? <form className="auth-form" onSubmit={(event) => void verifySecondFactor(event)}>
          <AuthInput label={recoveryMode ? 'Code de récupération' : 'Code d’authentification'} icon={KeyRound} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder={recoveryMode ? 'ABCDE-FGHIJ-KLMNO' : '123456'} required value={totpCode} onChange={(event) => setTotpCode(event.target.value)} />
          <p className="auth-form__hint">{emailMfaChallenge ? 'Un code à 6 chiffres vient d’être envoyé à votre adresse email.' : recoveryMode ? 'Saisissez un code de récupération non utilisé.' : 'Saisissez le code à 6 chiffres généré par votre application d’authentification.'}</p>
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={submitting}><KeyRound aria-hidden="true" />{submitting ? t('auth.login.submitting') : 'Vérifier'}</AuthSubmitButton>
          {!emailMfaChallenge && <button className="auth-link-button" type="button" onClick={() => { setRecoveryMode((value) => !value); setTotpCode(''); setError(null) }}>{recoveryMode ? 'Utiliser un code d’authentification' : 'Utiliser un code de récupération'}</button>}
        </form> : <form className="auth-form" onSubmit={(event) => void submit(event)}>
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
        </form>}
        <AuthSecureNotice />
      </AuthCard>
    </AuthLayout>
  )
}
