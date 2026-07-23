import { Mail, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { register } from '../api/registration'
import {
  AuthCard,
  AuthInput,
  AuthLayout,
  AuthPasswordInput,
  AuthSubmitButton,
} from '../components/auth/AuthLayout'

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

  if (done) {
    return (
      <AuthLayout>
        <AuthCard
          title="Demande transmise"
          subtitle="Votre inscription est maintenant en attente de validation."
          status="success"
          footer={<p>Déjà inscrit ? <Link to="/">Se connecter</Link></p>}
        >
          <div className="auth-confirmation" role="status">
            <p>Un administrateur doit approuver votre demande. Vous recevrez un email dès que votre compte sera actif.</p>
            <Link className="auth-secondary-link" to="/">Retour à la connexion</Link>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Créer votre compte"
        subtitle="Rejoignez votre espace cartographique privé."
        footer={<p>Déjà inscrit ? <Link to="/">Se connecter</Link></p>}
      >
        <p className="auth-card__context">Votre demande sera examinée par un administrateur avant l’activation du compte.</p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <AuthInput label="Adresse email" icon={Mail} name="email" type="email" autoComplete="email" placeholder="votre@email.com" required />
          <AuthPasswordInput label="Mot de passe" name="password" autoComplete="new-password" placeholder="12 caractères minimum" required minLength={12} />
          <AuthPasswordInput label="Confirmer le mot de passe" name="confirmation" autoComplete="new-password" placeholder="Confirmez votre mot de passe" required minLength={12} />
          {error && <p className="auth-alert" role="alert">{error}</p>}
          <AuthSubmitButton disabled={busy}>
            <Send aria-hidden="true" />
            {busy ? 'Envoi…' : 'Demander mon inscription'}
          </AuthSubmitButton>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
