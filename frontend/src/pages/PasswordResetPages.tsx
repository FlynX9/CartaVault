import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { confirmPasswordReset, requestPasswordReset } from '../api/registration'

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

  return <AuthCard title="Mot de passe oublié">
    <p>Indiquez votre adresse email pour recevoir un lien temporaire.</p>
    {message ? <p className="auth-success" role="status">{message}</p> : <form onSubmit={(event) => void submit(event)}>
      <label>Adresse email<input name="email" type="email" autoComplete="email" required /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer le lien'}</button>
    </form>}
    <p className="auth-link"><Link to="/">Retour à la connexion</Link></p>
  </AuthCard>
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

  return <AuthCard title="Nouveau mot de passe">
    {done ? <div className="auth-success" role="status">
      <p>Votre mot de passe a été modifié et vos anciennes sessions ont été fermées.</p>
      <Link to="/">Se connecter</Link>
    </div> : !token ? <p className="form-alert" role="alert">Ce lien de réinitialisation est incomplet.</p> : <form onSubmit={(event) => void submit(event)}>
      <label>Nouveau mot de passe<input name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
      <label>Confirmer le mot de passe<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Validation…' : 'Modifier le mot de passe'}</button>
    </form>}
  </AuthCard>
}

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return <main className="login-page"><section className="login-card">
    <img src="/cartavault-icon.png" alt="" className="login-card__logo" />
    <p className="cv-workspace-panel__eyebrow">Sécurité</p>
    <h1>{title}</h1>
    {children}
  </section></main>
}
