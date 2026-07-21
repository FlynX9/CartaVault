import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { register } from '../api/registration'

export function RegisterPage() {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      await register(String(data.get('email')), String(data.get('password')), String(data.get('confirmation')))
      setDone(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inscription impossible.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-page"><section className="login-card" aria-labelledby="register-title">
    <img src="/cartavault-icon.png" alt="" className="login-card__logo" />
    <p className="cv-workspace-panel__eyebrow">Créer un compte</p>
    <h1 id="register-title">Rejoindre CartaVault</h1>
    {done ? <div className="auth-success" role="status">
      <h2>Demande transmise</h2>
      <p>Un administrateur doit maintenant approuver votre inscription. Vous recevrez un email dès que votre compte sera actif.</p>
      <Link to="/">Retour à la connexion</Link>
    </div> : <>
      <p>Votre demande sera examinée par un administrateur avant la création du compte.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Adresse email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Mot de passe<input name="password" type="password" autoComplete="new-password" required minLength={12} /><small>12 caractères minimum.</small></label>
        <label>Confirmer le mot de passe<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} /></label>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Demander mon inscription'}</button>
      </form>
      <p className="auth-link"><Link to="/">Déjà inscrit ? Se connecter</Link></p>
    </>}
  </section></main>
}
