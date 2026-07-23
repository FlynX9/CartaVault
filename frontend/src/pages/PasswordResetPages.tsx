import { ArrowLeft, KeyRound, Mail, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { confirmPasswordReset, requestPasswordReset } from '../api/registration'
import {
  AuthCard,
  AuthInput,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmitButton,
} from '../components/auth/AuthLayout'

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await requestPasswordReset(String(new FormData(event.currentTarget).get('email')))
      setMessage(response.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Demande impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (message) {
    return (
      <AuthLayout>
        <AuthCard
          title="Consultez votre messagerie"
          subtitle="Votre demande de réinitialisation a bien été prise en compte."
          status="success"
          footer={<p><Link to="/">Retour à la connexion</Link></p>}
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
        title="Mot de passe oublié ?"
        subtitle="Recevez un lien sécurisé pour retrouver l’accès à votre compte."
        footer={<p><Link to="/"><ArrowLeft aria-hidden="true" /> Retour à la connexion</Link></p>}
      >
        <p className="auth-card__context">Indiquez l’adresse email associée à votre compte CartaVault.</p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput label="Adresse email" icon={Mail} name="email" type="email" autoComplete="email" placeholder="votre@email.com" required />
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={busy}>
            <Send aria-hidden="true" />
            {busy ? 'Envoi…' : 'Envoyer le lien'}
          </AuthSubmitButton>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
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
      setError(caught instanceof Error ? caught.message : 'Réinitialisation impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthCard
          title="Mot de passe modifié"
          subtitle="Votre compte est de nouveau sécurisé."
          status="success"
          footer={<p><Link to="/">Se connecter à CartaVault</Link></p>}
        >
          <div className="auth-confirmation" role="status">
            <p>Votre mot de passe a été modifié et vos anciennes sessions ont été fermées.</p>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Créer un nouveau mot de passe"
        subtitle="Choisissez un mot de passe unique pour protéger votre espace."
        footer={<p><Link to="/"><ArrowLeft aria-hidden="true" /> Retour à la connexion</Link></p>}
      >
        {!token ? (
          <div className="auth-alert" role="alert">Ce lien de réinitialisation est incomplet.</div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <AuthPasswordInput label="Nouveau mot de passe" name="password" autoComplete="new-password" placeholder="12 caractères minimum" required minLength={12} />
            <AuthPasswordInput label="Confirmer le mot de passe" name="confirmation" autoComplete="new-password" placeholder="Confirmez votre mot de passe" required minLength={12} />
            {error && <p className="auth-alert" role="alert">{error}</p>}
            <AuthSubmitButton disabled={busy}>
              <KeyRound aria-hidden="true" />
              {busy ? 'Validation…' : 'Modifier le mot de passe'}
            </AuthSubmitButton>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  )
}
