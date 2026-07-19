import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from 'lucide-react'

import { deleteGoogleRoutesCredential, storeGoogleRoutesCredential, verifyGoogleRoutesCredential } from '../../api/account'
import type { GoogleRoutesCredentialStatus } from '../../types/account'

interface GoogleRoutesCredentialPanelProps {
  status: GoogleRoutesCredentialStatus
  storageAvailable: boolean
  onChanged: (status: GoogleRoutesCredentialStatus, providerReset?: boolean) => Promise<void> | void
}

export function GoogleRoutesCredentialPanel({ status, storageAvailable, onChanged }: GoogleRoutesCredentialPanelProps) {
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(null); setMessage(null)
    try {
      const next = await storeGoogleRoutesCredential(apiKey)
      setApiKey(''); setEditing(false); setRevealed(false)
      await onChanged(next)
      setMessage('Clé enregistrée. Vérifiez-la avant de sélectionner Google Routes.')
    } catch (reason) {
      setApiKey('')
      setError(messageFor(reason, 'Impossible d’enregistrer la clé.'))
    } finally { setBusy(false) }
  }

  const verify = async () => {
    setBusy(true); setError(null); setMessage(null)
    try {
      const next = await verifyGoogleRoutesCredential()
      await onChanged(next)
      setMessage('La clé Google Routes est valide.')
    } catch (reason) { setError(messageFor(reason, 'La vérification a échoué.')) } finally { setBusy(false) }
  }

  const remove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!window.confirm('Supprimer votre clé Google Routes ? Les itinéraires enregistrés seront conservés et les prochains calculs utiliseront OSRM.')) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await deleteGoogleRoutesCredential(deletePassword)
      setDeletePassword(''); setConfirmingDelete(false)
      await onChanged({ configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null }, result.provider_reset)
      setMessage('Clé supprimée. Le moteur de calcul utilise OSRM.')
    } catch (reason) {
      setDeletePassword('')
      setError(messageFor(reason, 'Impossible de supprimer la clé.'))
    } finally { setBusy(false) }
  }

  return <section className="account-credential" aria-labelledby="google-routes-credential-title">
    <div className="account-credential__heading">
      <KeyRound size={18} aria-hidden="true" />
      <div><h3 id="google-routes-credential-title">Clé Google Routes</h3><p>{status.configured ? <>Clé configurée <strong>••••••••{status.last4}</strong></> : 'Aucune clé configurée'}</p></div>
      {status.verified && <span className="account-credential__status">Vérifiée</span>}
    </div>
    {!storageAvailable && <p className="account-credential__warning" role="status">Le stockage sécurisé des clés utilisateur n’est pas configuré sur ce serveur.</p>}
    {status.configured && status.verified_at && <small>Vérifiée le {formatDate(status.verified_at)}.</small>}
    {status.last_error_code && <p className="account-credential__warning">La clé doit être vérifiée ou remplacée avant utilisation.</p>}
    <p className="account-credential__help">La clé est chiffrée sur le serveur et n’est jamais renvoyée à votre navigateur après son enregistrement.</p>
    {(editing || !status.configured) && storageAvailable && <form className="account-credential__form" onSubmit={submit}>
      <label>Nouvelle clé
        <span className="account-secret-input"><input aria-label="Clé Google Routes" type={revealed ? 'text' : 'password'} value={apiKey} required maxLength={512} autoComplete="off" spellCheck={false} onChange={(event) => setApiKey(event.target.value)} /><button type="button" aria-label={revealed ? 'Masquer la clé' : 'Afficher la clé'} onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
      </label>
      <div className="account-credential__actions"><button className="account-button account-button--primary" type="submit" disabled={busy}>Enregistrer cette clé</button>{status.configured && <button className="account-button account-button--secondary" type="button" onClick={() => { setApiKey(''); setEditing(false) }}>Annuler</button>}</div>
    </form>}
    {status.configured && !editing && <div className="account-credential__actions"><button className="account-button account-button--secondary" type="button" disabled={busy} onClick={() => setEditing(true)}>Remplacer</button><button className="account-button account-button--secondary" type="button" disabled={busy} onClick={() => void verify()}><RefreshCw size={15} />Vérifier</button><button className="account-button account-button--danger-quiet" type="button" disabled={busy} onClick={() => setConfirmingDelete((value) => !value)}><Trash2 size={15} />Supprimer</button></div>}
    {status.configured && <small>La vérification effectue un appel à Google Routes API.</small>}
    {confirmingDelete && <form className="account-credential__delete" onSubmit={remove}><label>Mot de passe actuel<input type="password" value={deletePassword} required autoComplete="current-password" onChange={(event) => setDeletePassword(event.target.value)} /></label><button className="account-button account-button--danger" type="submit" disabled={busy}>Confirmer la suppression</button></form>}
    {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}
  </section>
}

function formatDate(value: string): string { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)) }
function messageFor(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback }
