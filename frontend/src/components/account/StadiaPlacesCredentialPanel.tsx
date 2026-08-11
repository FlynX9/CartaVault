import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, RefreshCw, Trash2 } from 'lucide-react'

import { deleteStadiaPlacesCredential, storeStadiaPlacesCredential, verifyStadiaPlacesCredential, type StadiaPlacesCredentialStatus } from '../../api/stadiaPlaces'
import { FieldHelp } from '../common/FieldHelp'
import { useConfirmDialog } from '../common/useConfirmDialog'
import { CredentialVerificationBadge, useCredentialVerificationState } from './CredentialVerificationBadge'

export function StadiaPlacesCredentialPanel({ status, storageAvailable, onChanged }: { status: StadiaPlacesCredentialStatus; storageAvailable: boolean; onChanged: (status: StadiaPlacesCredentialStatus) => Promise<void> | void }) {
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const verification = useCredentialVerificationState('stadia_places', status.last4, status.last_error_code)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null)
    try { const next = await storeStadiaPlacesCredential(apiKey); setApiKey(''); setEditing(false); setRevealed(false); await onChanged(next); setMessage('Clé enregistrée. Vérifiez-la pour utiliser le forfait Stadia associé.') }
    catch (reason) { setApiKey(''); setError(reason instanceof Error ? reason.message : 'Impossible d’enregistrer la clé.') }
    finally { setBusy(false) }
  }
  const verify = async () => {
    setBusy(true); setError(null); setMessage(null)
    try { const next = await verifyStadiaPlacesCredential(); await onChanged(next); verification.clearVerificationFailure(); setMessage('La clé Stadia Places est valide.') }
    catch (reason) { verification.markVerificationFailed(); setError(reason instanceof Error ? reason.message : 'La vérification a échoué.') }
    finally { setBusy(false) }
  }
  const remove = async (event: FormEvent) => {
    event.preventDefault()
    if (!await confirm({ title: 'Supprimer la clé Stadia Places ?', message: 'La recherche de lieux restera disponible avec l’accès public Stadia.' })) return
    setBusy(true); setError(null)
    try {
      await deleteStadiaPlacesCredential(deletePassword); setDeletePassword(''); setConfirmingDelete(false)
      await onChanged({ configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null })
      setMessage('Clé supprimée. La recherche utilise désormais l’accès public Stadia.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de supprimer la clé.') }
    finally { setBusy(false) }
  }

  return <section className="account-credential" aria-labelledby="stadia-places-credential-title">
    <div className="account-credential__heading"><span className="account-credential__icon"><KeyRound size={18} aria-hidden="true" /></span><div><h3 id="stadia-places-credential-title">Clé Stadia Places <span className="account-credential__optional">(facultative)</span><FieldHelp>Sans clé, CartaVault utilise l’accès public. Avec une clé vérifiée, les recherches consomment le forfait Stadia associé.</FieldHelp></h3><p>{status.configured ? <>Clé configurée <strong>••••••••{status.last4}</strong></> : 'Accès public sans clé personnelle'}</p></div><CredentialVerificationBadge status={status} failedAt={verification.failedAt} /></div>
    {!storageAvailable && <p className="account-credential__warning">Le stockage sécurisé des clés utilisateur n’est pas configuré.</p>}
    {status.last_error_code && <p className="account-credential__warning">La clé Stadia doit autoriser l’API de géocodage.</p>}
    {(editing || !status.configured) && storageAvailable && <form className="account-credential__form" onSubmit={submit}><label>Nouvelle clé<span className="account-secret-input"><input aria-label="Clé Stadia Places" type={revealed ? 'text' : 'password'} value={apiKey} required maxLength={512} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} /><button type="button" aria-label={revealed ? 'Masquer la clé' : 'Afficher la clé'} onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label><div className="account-credential__actions"><button className="account-button account-button--primary" type="submit" disabled={busy}>Enregistrer cette clé</button>{status.configured && <button className="account-button account-button--secondary" type="button" onClick={() => setEditing(false)}>Annuler</button>}</div></form>}
    {status.configured && !editing && <div className="account-credential__actions"><button className="account-button account-button--secondary" type="button" disabled={busy} onClick={() => setEditing(true)}>Remplacer</button><button className="account-button account-button--secondary" type="button" disabled={busy} onClick={() => void verify()}><RefreshCw size={15} />Vérifier</button><button className="account-button account-button--secondary account-button--danger-hover" type="button" disabled={busy} onClick={() => setConfirmingDelete((value) => !value)}><Trash2 size={15} />Supprimer</button></div>}
    {confirmingDelete && <form className="account-credential__delete" onSubmit={remove}><label>Mot de passe actuel<input type="password" value={deletePassword} required autoComplete="current-password" onChange={(event) => setDeletePassword(event.target.value)} /></label><button className="account-button account-button--danger" type="submit" disabled={busy}>Confirmer la suppression</button></form>}
    {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}{confirmationDialog}
  </section>
}
