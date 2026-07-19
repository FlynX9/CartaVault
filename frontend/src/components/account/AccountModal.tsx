import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Camera, MonitorSmartphone, Settings2, Shield, ShieldCheck, Trash2, Upload, UserRound, X } from 'lucide-react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, accountAvatarUrl, changeAccountEmail, changeAccountPassword, deleteAccountAvatar, deleteOwnAccount, getAccountPreferences, getAccountProfile, getAccountSessions, getGoogleRoutesCredential, resetAccountPreferences, revokeAccountSession, revokeOtherAccountSessions, updateAccountPreferences, updateAccountProfile, uploadAccountAvatar } from '../../api/account'
import { SESSION_EXPIRED_EVENT } from '../../api/client'
import { getRoutingProviders } from '../../api/routing'
import { useAuth } from '../../auth/useAuth'
import type { AccountPreferences, AccountProfile, AccountSession, GoogleRoutesCredentialStatus } from '../../types/account'
import { GoogleRoutesCredentialPanel } from './GoogleRoutesCredentialPanel'

type Section = 'profile' | 'avatar' | 'security' | 'sessions' | 'preferences' | 'admin' | 'danger'

const emptyPreferences: AccountPreferences = { preferred_basemap: 'cartavault-light', density: 'comfortable', startup_panel: 'maps', timezone: 'Europe/Paris', routing: { provider: 'osrm', stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' } }

export function AccountModal({ onClose, onOpenAdmin, trigger }: { onClose: () => void; onOpenAdmin: () => void; trigger: HTMLElement | null }) {
  const { user, refresh } = useAuth()
  const [section, setSection] = useState<Section>('profile')
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [preferences, setPreferences] = useState<AccountPreferences>(emptyPreferences)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const modal = useRef<HTMLElement>(null)
  const dirty = profile !== null && section === 'profile' && draftName.trim() !== profile.display_name
  const dirtyRef = useRef(false)
  const closeRef = useRef(onClose)
  dirtyRef.current = dirty
  closeRef.current = onClose
  const avatar = accountAvatarUrl(profile?.avatar_url ?? user?.avatar_url ?? null)
  const initials = (profile?.display_name ?? user?.display_name ?? '?').trim().charAt(0).toUpperCase()

  const load = async () => {
    const [nextProfile, nextSessions, nextPreferences] = await Promise.all([getAccountProfile(), getAccountSessions(), getAccountPreferences()])
    setProfile(nextProfile); setDraftName(nextProfile.display_name); setSessions(nextSessions); setPreferences(nextPreferences)
  }
  useEffect(() => { void load().catch((reason: unknown) => setError(messageFor(reason, 'Chargement impossible.'))) }, [])
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!dirtyRef.current || window.confirm('Abandonner les modifications non enregistrées ?')) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !modal.current) return
      const focusable = [...modal.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0]; const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); trigger?.focus() }
  }, [trigger])

  const requestClose = () => { if (!dirty || window.confirm('Abandonner les modifications non enregistrées ?')) onClose() }
  const selectSection = (next: Section) => { if (next === section || !dirty || window.confirm('Abandonner les modifications non enregistrées ?')) setSection(next) }
  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    setError(null); setMessage(null)
    try { await action(); setMessage(success); return true } catch (reason) { setError(messageFor(reason, 'Opération impossible.')); return false }
  }
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dirty) return
    await run(async () => { await updateAccountProfile(draftName); await refresh(); await load() }, 'Profil mis à jour.')
  }
  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choisissez une image JPEG, PNG ou WebP de 5 Mio maximum.'); return }
    await run(async () => { await uploadAccountAvatar(file); await refresh(); await load() }, 'Avatar mis à jour.')
  }

  return createPortal(
    <div className="account-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={modal} className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="account-modal__header">
          <div className="account-avatar">{avatar ? <img src={avatar} alt={`Avatar de ${profile?.display_name ?? user?.display_name}`} /> : initials}</div>
          <div><h2 id="account-title">Mon compte</h2><p>{profile?.email ?? user?.email}</p>{user?.is_admin && <span><Shield size={13} />Administrateur</span>}</div>
          <button ref={closeButton} className="panel-icon-button" type="button" aria-label="Fermer l’espace compte" onClick={requestClose}><X size={18} /></button>
        </header>
        <nav className="account-modal__nav" aria-label="Gestion du compte">
          {([[ 'profile', UserRound, 'Profil' ], [ 'avatar', Camera, 'Avatar' ], [ 'security', ShieldCheck, 'Sécurité' ], [ 'sessions', MonitorSmartphone, 'Sessions' ], [ 'preferences', Settings2, 'Préférences' ]] as const).map(([id, Icon, label]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => selectSection(id)}><Icon size={17} />{label}</button>)}
          {user?.is_admin && <button type="button" onClick={() => selectSection('admin')} aria-current={section === 'admin' ? 'page' : undefined}><Shield size={17} />Administration</button>}
          <button className="danger" type="button" onClick={() => selectSection('danger')} aria-current={section === 'danger' ? 'page' : undefined}><AlertTriangle size={17} />Zone sensible</button>
        </nav>
        <main className="account-modal__content">
          {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}
          {section === 'profile' && profile && <><AccountHeading title="Profil" description="Gérez votre identité CartaVault." /><form className="account-form" onSubmit={saveProfile}><label>Nom d’affichage<input name="display_name" value={draftName} required maxLength={120} onChange={(event) => setDraftName(event.target.value)} /></label><button className="account-button account-button--primary" type="submit" disabled={!dirty}>Enregistrer</button></form><dl className="account-metadata"><dt>Adresse e-mail</dt><dd>{profile.email}</dd><dt>Compte créé</dt><dd>{formatDate(profile.created_at)}</dd><dt>Dernière connexion</dt><dd>{profile.last_login_at ? formatDate(profile.last_login_at, true) : 'Non disponible'}</dd><dt>Cartes possédées</dt><dd>{profile.owned_maps.length}</dd></dl></>}
          {section === 'avatar' && <><AccountHeading title="Avatar" description="Une image carrée, traitée et stockée séparément de vos photos de lieux." /><div className="account-avatar-editor"><div className="account-avatar large">{avatar ? <img src={avatar} alt="Aperçu de l’avatar" /> : initials}</div><div><label className="account-button account-button--secondary"><Upload size={15} />Importer une image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = '' }} /></label>{avatar && <button className="account-button account-button--danger-quiet" type="button" onClick={() => void run(async () => { await deleteAccountAvatar(); await refresh(); await load() }, 'Avatar supprimé.')}><Trash2 size={15} />Supprimer</button>}<small>JPEG, PNG ou WebP · 5 Mio maximum.</small></div></div></>}
          {section === 'security' && profile && <SecuritySection profile={profile} run={run} refreshProfile={async () => { await refresh(); await load() }} />}
          {section === 'sessions' && <SessionsSection sessions={sessions} run={run} reload={load} />}
          {section === 'preferences' && <><PreferencesSection preferences={preferences} setPreferences={setPreferences} run={run} /><CredentialPreferencesPanel preferences={preferences} setPreferences={setPreferences} /></>}
          {section === 'admin' && <><AccountHeading title="Administration" description="La gestion globale des utilisateurs reste séparée de votre compte personnel." /><button className="account-button account-button--primary" type="button" onClick={() => { onClose(); onOpenAdmin() }}>Ouvrir l’administration</button></>}
          {section === 'danger' && profile && <DangerSection profile={profile} run={run} />}
        </main>
      </section>
    </div>, document.body,
  )
}

function SecuritySection({ profile, run, refreshProfile }: { profile: AccountProfile; run: (action: () => Promise<void>, success: string) => Promise<boolean>; refreshProfile: () => Promise<void> }) {
  return <><AccountHeading title="Sécurité" description="Les autres appareils sont déconnectés après une modification sensible." /><form className="account-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await changeAccountEmail(String(data.get('current_password')), String(data.get('new_email'))); await refreshProfile() }, 'Adresse e-mail mise à jour.').then((ok) => { if (ok) form.reset() }) }}><h3>Changer l’adresse e-mail</h3><label>Nouvelle adresse<input name="new_email" type="email" required /></label><label>Mot de passe actuel<input name="current_password" type="password" required autoComplete="current-password" /></label><button className="account-button account-button--primary" type="submit">Modifier l’e-mail</button></form><form className="account-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(() => changeAccountPassword(String(data.get('current_password')), String(data.get('new_password')), String(data.get('confirmation'))), 'Mot de passe mis à jour.').then((ok) => { if (ok) form.reset() }) }}><h3>Changer le mot de passe</h3><label>Mot de passe actuel<input name="current_password" type="password" required autoComplete="current-password" /></label><label>Nouveau mot de passe<input name="new_password" type="password" minLength={12} required autoComplete="new-password" /></label><label>Confirmation<input name="confirmation" type="password" minLength={12} required autoComplete="new-password" /></label><button className="account-button account-button--primary" type="submit">Modifier le mot de passe</button></form><div className="account-info"><strong>{profile.active_session_count}</strong> sessions actives · Compte {profile.is_active ? 'actif' : 'inactif'}. L’authentification à deux facteurs n’est pas encore disponible.</div></>
}

function SessionsSection({ sessions, run, reload }: { sessions: AccountSession[]; run: (action: () => Promise<void>, success: string) => Promise<boolean>; reload: () => Promise<void> }) {
  return <><AccountHeading title="Sessions actives" description="Contrôlez les appareils connectés à votre compte." /><button className="account-button account-button--secondary" type="button" onClick={() => void run(async () => { await revokeOtherAccountSessions(); await reload() }, 'Autres sessions révoquées.')}>Révoquer les autres sessions</button>{sessions.length === 0 ? <p className="account-info">Aucune session active.</p> : <ul className="account-sessions">{sessions.map((item) => <li key={item.id}><MonitorSmartphone size={19} /><div><strong>{item.user_agent || 'Appareil inconnu'}</strong><span>Dernière activité : {formatDate(item.last_used_at, true)}</span>{item.is_current && <b>Session actuelle</b>}</div>{!item.is_current && <button className="panel-icon-button danger" type="button" aria-label="Révoquer cette session" onClick={() => void run(async () => { await revokeAccountSession(item.id); await reload() }, 'Session révoquée.')}><Trash2 size={15} /></button>}</li>)}</ul>}</>
}

function PreferencesSection({ preferences, setPreferences, run }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void; run: (action: () => Promise<void>, success: string) => Promise<boolean> }) {
  const [googleAvailable, setGoogleAvailable] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const loadProviders = () => { void getRoutingProviders(controller.signal).then((result) => setGoogleAvailable(result.providers.some((item) => item.id === 'google' && item.available))).catch(() => setGoogleAvailable(false)) }
    loadProviders(); window.addEventListener('cartavault:routing-credential-updated', loadProviders)
    return () => { controller.abort(); window.removeEventListener('cartavault:routing-credential-updated', loadProviders) }
  }, [])
  const update = <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => setPreferences({ ...preferences, [key]: value })
  const updateRouting = <K extends keyof AccountPreferences['routing']>(key: K, value: AccountPreferences['routing'][K]) => setPreferences({ ...preferences, routing: { ...preferences.routing, [key]: value } })
  const apply = (next: AccountPreferences) => { setPreferences(next); window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next })) }
  const googleSelected = preferences.routing.provider === 'google'
  return <><AccountHeading title="Préférences" description="Ces réglages sont associés à votre compte, sur tous vos appareils." /><form className="account-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { apply(await updateAccountPreferences(preferences)) }, 'Préférences enregistrées.') }}><label>Fond cartographique préféré<select value={preferences.preferred_basemap} onChange={(event) => update('preferred_basemap', event.target.value as AccountPreferences['preferred_basemap'])}><option value="cartavault-light">Clair</option><option value="cartavault-dark">Sombre</option><option value="satellite">Satellite</option><option value="osm">OpenStreetMap</option></select></label><label>Densité d’affichage<select value={preferences.density} onChange={(event) => update('density', event.target.value as AccountPreferences['density'])}><option value="comfortable">Confortable</option><option value="compact">Compacte</option></select></label><label>Panneau au démarrage<select value={preferences.startup_panel} onChange={(event) => update('startup_panel', event.target.value as AccountPreferences['startup_panel'])}><option value="maps">Cartes</option><option value="places">Lieux</option><option value="last">Dernière vue utilisée</option></select></label><label>Fuseau horaire<input value={preferences.timezone} maxLength={64} onChange={(event) => update('timezone', event.target.value)} /></label><fieldset className="account-routing-preferences"><legend>Routage</legend><label>Moteur de calcul<select value={preferences.routing.provider} onChange={(event) => updateRouting('provider', event.target.value as AccountPreferences['routing']['provider'])}><option value="osrm">OSRM</option><option value="google" disabled={!googleAvailable}>Google Routes</option></select></label><small>{googleAvailable ? 'OSRM reste libre ; Google Routes utilise la configuration serveur et peut être facturé.' : 'Google Routes n’est pas configuré sur ce serveur.'}</small><label className="checkbox-field"><input type="checkbox" checked={preferences.routing.stay_in_country} onChange={(event) => updateRouting('stay_in_country', event.target.checked)} />Rester dans le pays</label>{googleSelected && <div className="account-routing-options"><label className="checkbox-field"><input type="checkbox" checked={preferences.routing.avoid_tolls} onChange={(event) => updateRouting('avoid_tolls', event.target.checked)} />Éviter les péages</label><label className="checkbox-field"><input type="checkbox" checked={preferences.routing.avoid_highways} onChange={(event) => updateRouting('avoid_highways', event.target.checked)} />Éviter les autoroutes</label><label className="checkbox-field"><input type="checkbox" checked={preferences.routing.avoid_ferries} onChange={(event) => updateRouting('avoid_ferries', event.target.checked)} />Éviter les ferries</label><label>Prise en compte du trafic<select value={preferences.routing.traffic_mode} onChange={(event) => updateRouting('traffic_mode', event.target.value as AccountPreferences['routing']['traffic_mode'])}><option value="traffic_unaware">Sans trafic</option><option value="traffic_aware">Trafic actuel</option><option value="traffic_aware_optimal">Trafic optimal (sans optimisation d’ordre)</option></select></label></div>}<small>CartaVault valide toujours la contrainte pays après le calcul. Aucun basculement vers OSRM n’est automatique.</small></fieldset><label>Langue<input readOnly value="Français" /></label><button className="account-button account-button--primary" type="submit">Enregistrer</button><button className="account-button account-button--secondary" type="button" onClick={() => void run(async () => { apply(await resetAccountPreferences()) }, 'Préférences réinitialisées.')}>Réinitialiser les préférences</button></form></>
}

function CredentialPreferencesPanel({ preferences, setPreferences }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void }) {
  const [status, setStatus] = useState<GoogleRoutesCredentialStatus>({ configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null })
  const [storageAvailable, setStorageAvailable] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getGoogleRoutesCredential(controller.signal), getRoutingProviders(controller.signal)]).then(([credential, providers]) => { setStatus(credential); setStorageAvailable(providers.credential_storage_available) }).catch(() => setStorageAvailable(false))
    return () => controller.abort()
  }, [])
  return <GoogleRoutesCredentialPanel status={status} storageAvailable={storageAvailable} onChanged={async (next, providerReset) => { setStatus(next); const providers = await getRoutingProviders(); setStorageAvailable(providers.credential_storage_available); if (providerReset) setPreferences({ ...preferences, routing: { ...preferences.routing, provider: 'osrm' } }); window.dispatchEvent(new Event('cartavault:routing-credential-updated')) }} />
}

function DangerSection({ profile, run }: { profile: AccountProfile; run: (action: () => Promise<void>, success: string) => Promise<boolean> }) {
  const [confirmation, setConfirmation] = useState(''); const [password, setPassword] = useState(''); const [acknowledged, setAcknowledged] = useState(false)
  const ready = profile.can_delete && confirmation === 'SUPPRIMER MON COMPTE' && password.length > 0 && acknowledged
  return <><AccountHeading title="Zone sensible" description="La suppression désactive et anonymise définitivement votre compte." /><div className="account-danger-summary"><p>{profile.owned_maps.length} carte(s) possédée(s), {profile.shared_map_count} carte(s) partagée(s).</p>{profile.owned_maps.length > 0 && <><strong>Transférez ou supprimez d’abord :</strong><ul>{profile.owned_maps.map((map) => <li key={map.id}>{map.name}</li>)}</ul></>}</div><form className="account-form danger" onSubmit={(event) => { event.preventDefault(); void run(async () => { await deleteOwnAccount(password, confirmation, acknowledged); window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)) }, 'Compte supprimé.') }}><label>Mot de passe actuel<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Recopiez SUPPRIMER MON COMPTE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="SUPPRIMER MON COMPTE" required /></label><label className="checkbox-field"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Je comprends que cette action est définitive.</label><button className="account-button account-button--danger" type="submit" disabled={!ready}>Supprimer mon compte</button></form></>
}

function AccountHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">Compte</p><h2>{title}</h2><span>{description}</span></header> }
function formatDate(value: string, withTime = false): string { return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(value)) }
function messageFor(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback }
