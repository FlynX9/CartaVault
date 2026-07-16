import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { acceptInvitation, getInvitation } from '../api/maps'
import { useAuth } from '../auth/useAuth'
import type { PublicInvitation } from '../types/map'

export function InvitationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const controller = new AbortController(); setLoading(true)
    void getInvitation(token, controller.signal).then(setInvitation).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Invitation indisponible.')).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token])

  const accept = async (account?: { display_name: string; password: string }) => {
    setSubmitting(true); setError(null)
    try { await acceptInvitation(token, account); await refresh(); navigate('/', { replace: true }) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Acceptation impossible.') }
    finally { setSubmitting(false) }
  }

  return <main className="login-page"><section className="login-card invitation-page" aria-labelledby="invitation-title"><div className="login-brand"><img src="/cartavault-icon.svg" alt="" /><span>Carta<strong>Vault</strong></span></div>{loading ? <p role="status">Chargement de l’invitation…</p> : error && invitation === null ? <div className="form-alert" role="alert">{error}</div> : invitation && <><p className="cv-workspace-panel__eyebrow">Invitation privée</p><h1 id="invitation-title">Rejoindre {invitation.map_name}</h1><p>L’adresse <strong>{invitation.email}</strong> est invitée comme {invitation.role === 'editor' ? 'éditeur' : 'lecteur'}.</p><p>Cette invitation expire le {new Date(invitation.expires_at).toLocaleString('fr-FR')}.</p>{error && <div className="form-alert" role="alert">{error}</div>}{invitation.requires_account ? <NewInvitedAccountForm submitting={submitting} onSubmit={(account) => void accept(account)} /> : user ? <button className="primary-button" type="button" disabled={submitting} onClick={() => void accept()}>{submitting ? 'Acceptation…' : 'Accepter l’invitation'}</button> : <><p>Connectez-vous avec l’adresse invitée, puis rouvrez ce lien.</p><Link className="primary-button" to="/">Se connecter</Link></>}</>}</section></main>
}

function NewInvitedAccountForm({ submitting, onSubmit }: { submitting: boolean; onSubmit: (account: { display_name: string; password: string }) => void }) {
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  return <form className="login-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password')); if (password !== String(data.get('confirmation'))) { setConfirmationError('Les mots de passe ne correspondent pas.'); return } setConfirmationError(null); onSubmit({ display_name: String(data.get('display_name')), password }) }}><label>Nom affiché<input name="display_name" required maxLength={120} autoComplete="name" /></label><label>Mot de passe<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><label>Confirmation<input name="confirmation" type="password" required minLength={12} autoComplete="new-password" /></label>{confirmationError && <p className="form-alert" role="alert">{confirmationError}</p>}<button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Création…' : 'Créer mon compte et accepter'}</button></form>
}
