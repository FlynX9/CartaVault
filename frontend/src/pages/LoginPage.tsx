import { LogIn, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
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
      setError(caught instanceof Error ? caught.message : 'Connexion impossible.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Connexion à CartaVault"
        subtitle="Accédez à votre espace personnel."
        footer={<p>Vous n’avez pas de compte ? <Link to="/register">Créer un compte</Link></p>}
      >
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput
            label="Adresse email"
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder="votre@email.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <AuthPasswordInput
            label="Mot de passe"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
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
              <span>Se souvenir de moi</span>
            </label>
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
          </div>
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={submitting}>
            <LogIn aria-hidden="true" />
            {submitting ? 'Connexion…' : 'Se connecter'}
          </AuthSubmitButton>
        </form>
        <AuthSecureNotice />
      </AuthCard>
    </AuthLayout>
  )
}
