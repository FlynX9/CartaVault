import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError(null)
    try { await login({ email, password }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connexion impossible.') }
    finally { setSubmitting(false) }
  }
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title">
    <img src="/cartavault-icon.png" alt="" className="login-card__logo" />
    <p className="cv-workspace-panel__eyebrow">Espace privé</p><h1 id="login-title">Connexion à CartaVault</h1>
    <p>Accédez aux cartes qui vous appartiennent ou qui sont partagées avec vous.</p>
    <form onSubmit={(event) => void submit(event)}>
      <label>Adresse email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Connexion…' : 'Connexion'}</button>
    </form>
    <nav className="auth-links" aria-label="Aide à la connexion"><a href="/forgot-password">Mot de passe oublié ?</a><a href="/register">Créer un compte</a></nav>
  </section></main>
}
