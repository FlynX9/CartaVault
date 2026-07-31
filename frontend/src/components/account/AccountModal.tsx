import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Clock3, Languages, List, Map as MapIcon, MonitorSmartphone, Route, Settings2, Shield, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserRound, X, type LucideIcon } from 'lucide-react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, accountAvatarUrl, changeAccountEmail, changeAccountPassword, deleteAccountAvatar, deleteOwnAccount, getAccountPreferences, getAccountProfile, getAccountSessions, getGoogleRoutesCredential, resetAccountPreferences, revokeAccountSession, revokeOtherAccountSessions, updateAccountPreferences, updateAccountProfile, uploadAccountAvatar } from '../../api/account'
import { SESSION_EXPIRED_EVENT } from '../../api/client'
import { getRoutingProviders } from '../../api/routing'
import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import { applyDisplayDensity, saveDisplayDensity } from '../../theme/displayDensity'
import type { AccountPreferences, AccountProfile, AccountSession, GoogleRoutesCredentialStatus } from '../../types/account'
import { FieldHelp } from '../common/FieldHelp'
import { GoogleRoutesCredentialPanel } from './GoogleRoutesCredentialPanel'

type Section = 'profile' | 'security' | 'sessions' | 'preferences' | 'danger'

const emptyPreferences: AccountPreferences = { language: 'fr', preferred_basemap: 'cartavault-light', density: 'compact', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm', stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' } }

const fallbackTimeZones = ['Europe/Paris', 'Europe/London', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid', 'Europe/Zurich', 'America/New_York', 'America/Los_Angeles', 'America/Toronto', 'Asia/Tbilisi', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland', 'UTC']
const supportedTimeZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : fallbackTimeZones

export function AccountModal({ onClose, trigger }: { onClose: () => void; onOpenAdmin?: () => void; trigger: HTMLElement | null }) {
  const { user, refresh } = useAuth()
  const { t } = useI18n()
  const translationRef = useRef(t)
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
  translationRef.current = t
  const avatar = accountAvatarUrl(profile?.avatar_url ?? user?.avatar_url ?? null)
  const initials = (profile?.display_name ?? user?.display_name ?? '?').trim().charAt(0).toUpperCase()

  const load = async () => {
    const [nextProfile, nextSessions, nextPreferences] = await Promise.all([getAccountProfile(), getAccountSessions(), getAccountPreferences()])
    setProfile(nextProfile); setDraftName(nextProfile.display_name); setSessions(nextSessions); setPreferences(nextPreferences)
  }
  useEffect(() => {
    void load().catch((reason: unknown) => setError(messageFor(reason, translationRef.current('account.loadError'))))
  }, [])
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!dirtyRef.current || window.confirm(t('account.discard'))) closeRef.current()
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
  }, [trigger, t])

  const requestClose = () => { if (!dirty || window.confirm(t('account.discard'))) onClose() }
  const selectSection = (next: Section) => { if (next === section || !dirty || window.confirm(t('account.discard'))) setSection(next) }
  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    setError(null); setMessage(null)
    try { await action(); setMessage(success); return true } catch (reason) { setError(messageFor(reason, t('account.operationError'))); return false }
  }
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dirty) return
    await run(async () => { await updateAccountProfile(draftName); await refresh(); await load() }, t('account.profileUpdated'))
  }
  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(t('account.avatarInvalid')); return }
    await run(async () => { await uploadAccountAvatar(file); await refresh(); await load() }, t('account.avatarUpdated'))
  }

  return createPortal(
    <div className="account-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={modal} className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="account-modal__header">
          <div className="account-avatar">{avatar ? <img src={avatar} alt={`Avatar de ${profile?.display_name ?? user?.display_name}`} /> : initials}</div>
          <div><h2 id="account-title">{t('account.title')}</h2><p>{profile?.email ?? user?.email}</p>{user?.is_admin && <span><Shield size={13} />{t('account.admin')}</span>}</div>
          <button ref={closeButton} className="panel-icon-button" type="button" aria-label={t('account.close')} onClick={requestClose}><X size={18} /></button>
        </header>
        <nav className="account-modal__nav" aria-label={t('account.navigation')}>
          {([[ 'profile', UserRound, t('account.profile') ], [ 'security', ShieldCheck, t('account.security') ], [ 'sessions', MonitorSmartphone, t('account.sessions') ], [ 'preferences', Settings2, t('account.preferences') ]] as const).map(([id, Icon, label]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => selectSection(id)}><Icon size={17} />{label}</button>)}
          <button className="danger" type="button" onClick={() => selectSection('danger')} aria-current={section === 'danger' ? 'page' : undefined}><AlertTriangle size={17} />{t('account.danger')}</button>
        </nav>
        <main className="account-modal__content">
          {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}
          {section === 'profile' && profile && <><AccountHeading title="Profil" description="Gérez votre identité CartaVault et votre avatar." /><div className="account-profile-section"><form className="account-form" onSubmit={saveProfile}><label>Nom d’affichage<input name="display_name" value={draftName} required maxLength={120} onChange={(event) => setDraftName(event.target.value)} /></label><button className="account-button account-button--primary" type="submit" disabled={!dirty}>Enregistrer</button></form><div className="account-avatar-editor"><div className="account-avatar large">{avatar ? <img src={avatar} alt="Aperçu de l’avatar" /> : initials}</div><div><strong>Avatar</strong><p>Une image carrée, traitée et stockée séparément de vos photos de lieux.</p><div><label className="account-button account-button--secondary"><Upload size={15} />Importer une image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = '' }} /></label>{avatar && <button className="account-button account-button--danger-quiet" type="button" onClick={() => void run(async () => { await deleteAccountAvatar(); await refresh(); await load() }, 'Avatar supprimé.')}><Trash2 size={15} />Supprimer</button>}</div><small>JPEG, PNG ou WebP · 5 Mio maximum.</small></div></div></div><dl className="account-metadata"><dt>Adresse e-mail</dt><dd>{profile.email}</dd><dt>Compte créé</dt><dd>{formatDate(profile.created_at)}</dd><dt>Dernière connexion</dt><dd>{profile.last_login_at ? formatDate(profile.last_login_at, true) : 'Non disponible'}</dd><dt>Cartes possédées</dt><dd>{profile.owned_maps.length}</dd></dl></>}
          {section === 'security' && profile && <SecuritySection profile={profile} run={run} refreshProfile={async () => { await refresh(); await load() }} />}
          {section === 'sessions' && <SessionsSection sessions={sessions} run={run} reload={load} />}
          {section === 'preferences' && <PreferencesSection preferences={preferences} setPreferences={setPreferences} run={run} />}
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
  return <><AccountHeading title="Sessions actives" description="Contrôlez les appareils connectés à votre compte." /><button className="account-button account-button--secondary account-button--danger-hover" type="button" onClick={() => void run(async () => { await revokeOtherAccountSessions(); await reload() }, 'Autres sessions révoquées.')}>Révoquer les autres sessions</button>{sessions.length === 0 ? <p className="account-info">Aucune session active.</p> : <ul className="account-sessions">{sessions.map((item) => <li key={item.id}><MonitorSmartphone size={19} /><div><strong>{item.user_agent || 'Appareil inconnu'}</strong><span>Dernière activité : {formatDate(item.last_used_at, true)}</span>{item.is_current && <b>Session actuelle</b>}</div>{!item.is_current && <button className="panel-icon-button danger" type="button" aria-label="Révoquer cette session" onClick={() => void run(async () => { await revokeAccountSession(item.id); await reload() }, 'Session révoquée.')}><Trash2 size={15} /></button>}</li>)}</ul>}</>
}

function PreferenceCardHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return <header className="account-preference-card__heading"><span className="account-preference-card__icon"><Icon size={19} aria-hidden="true" /></span><h3>{title}</h3></header>
}

function PreferenceField({ icon: Icon, label, htmlFor, help, children, className = '' }: { icon?: LucideIcon; label: string; htmlFor: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={`account-preference-field ${className}`.trim()}>
    <div className="account-preference-field__label">{Icon && <Icon size={16} aria-hidden="true" />}<label id={`${htmlFor}-label`} htmlFor={htmlFor}>{label}</label>{help && <FieldHelp>{help}</FieldHelp>}</div>
    {children}
  </div>
}

function PreferencesSection({ preferences, setPreferences, run }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void; run: (action: () => Promise<void>, success: string) => Promise<boolean> }) {
  const { setLocale, t } = useI18n()
  const [credentialStatus, setCredentialStatus] = useState<GoogleRoutesCredentialStatus>({ configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null })
  const [storageAvailable, setStorageAvailable] = useState(false)
  const [routingError, setRoutingError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getRoutingProviders(controller.signal), getGoogleRoutesCredential(controller.signal)])
      .then(([providers, credential]) => { setStorageAvailable(providers.credential_storage_available); setCredentialStatus(credential) })
      .catch(() => { setStorageAvailable(false); setCredentialStatus({ configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null }) })
    return () => controller.abort()
  }, [])
  const update = <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => setPreferences({ ...preferences, [key]: value })
  const updateRouting = <K extends keyof AccountPreferences['routing']>(key: K, value: AccountPreferences['routing'][K]) => setPreferences({ ...preferences, routing: { ...preferences.routing, [key]: value } })
  const apply = (next: AccountPreferences) => { setPreferences(next); window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next })) }
  const googleSelected = preferences.routing.provider === 'google'
  const handleCredentialChange = async (next: GoogleRoutesCredentialStatus, providerReset?: boolean) => {
    setCredentialStatus(next)
    const providers = await getRoutingProviders()
    setStorageAvailable(providers.credential_storage_available)
    if (providerReset) setPreferences({ ...preferences, routing: { ...preferences.routing, provider: 'osrm' } })
  }
  const savePreferences = () => {
    setRoutingError(null)
    if (googleSelected && !credentialStatus.verified) {
      setRoutingError(t('account.preferences.googleCredentialRequired'))
      return
    }
    void run(async () => { apply(await updateAccountPreferences(preferences)) }, t('account.preferences.saved'))
  }
  return <><AccountHeading title={t('account.preferences.title')} description={t('account.preferences.description')} /><div className="account-form account-preferences-form">
    <section className="account-preference-card">
      <PreferenceCardHeading icon={Settings2} title={t('account.preferences.general')} />
      <div className="account-preference-grid">
        <PreferenceField icon={Languages} label={t('common.language')} htmlFor="account-language" help={t('account.preferences.languageHelp')}>
          <select id="account-language" aria-labelledby="account-language-label" value={preferences.language} onChange={(event) => { const language = event.target.value as AccountPreferences['language']; update('language', language); setLocale(language) }}><option value="fr">{t('common.french')}</option><option value="en">{t('common.english')}</option></select>
        </PreferenceField>
        <PreferenceField icon={MapIcon} label={t('account.preferences.basemap')} htmlFor="account-basemap">
          <select id="account-basemap" aria-labelledby="account-basemap-label" value={preferences.preferred_basemap} onChange={(event) => update('preferred_basemap', event.target.value as AccountPreferences['preferred_basemap'])}><option value="cartavault-light">{t('common.light')}</option><option value="cartavault-dark">{t('common.dark')}</option><option value="satellite">Satellite</option><option value="osm">OpenStreetMap</option></select>
        </PreferenceField>
        <PreferenceField icon={List} label={t('account.preferences.density')} htmlFor="account-density">
          <select id="account-density" aria-labelledby="account-density-label" value={preferences.density} onChange={(event) => { const density = event.target.value as AccountPreferences['density']; update('density', density); applyDisplayDensity(density); saveDisplayDensity(density, window.localStorage) }}><option value="compact">{t('account.preferences.compact')}</option><option value="comfortable">{t('account.preferences.comfortable')}</option><option value="spacious">{t('account.preferences.spacious')}</option></select>
        </PreferenceField>
        <PreferenceField icon={MonitorSmartphone} label={t('account.preferences.startup')} htmlFor="account-startup">
          <select id="account-startup" aria-labelledby="account-startup-label" value={preferences.startup_panel} onChange={(event) => update('startup_panel', event.target.value as AccountPreferences['startup_panel'])}><option value="dashboard">{t('dashboard.title')}</option><option value="maps">{t('nav.maps')}</option><option value="places">{t('nav.places')}</option><option value="last">{t('account.preferences.lastView')}</option></select>
        </PreferenceField>
        <TimezoneCombobox value={preferences.timezone} label={t('account.preferences.timezone')} onChange={(timezone) => update('timezone', timezone)} />
        <PreferenceField icon={Trash2} label={t('account.preferences.trashRetention')} htmlFor="account-trash-retention" help={t('account.preferences.trashRetentionHelp')}>
          <select id="account-trash-retention" aria-labelledby="account-trash-retention-label" value={preferences.trash_retention_days} onChange={(event) => update('trash_retention_days', Number(event.target.value))}>{[7, 14, 30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {t('account.preferences.days')}</option>)}</select>
        </PreferenceField>
      </div>
    </section>
    <section className="account-preference-card account-preference-card--routing">
      <PreferenceCardHeading icon={Route} title={t('account.preferences.routing')} />
      <PreferenceField label={t('account.preferences.engine')} htmlFor="account-routing-engine" help={storageAvailable ? t('account.preferences.googlePersonalKeyHelp') : t('account.preferences.googleUnavailable')} className="account-routing-engine">
        <select id="account-routing-engine" aria-labelledby="account-routing-engine-label" value={preferences.routing.provider} onChange={(event) => { setRoutingError(null); updateRouting('provider', event.target.value as AccountPreferences['routing']['provider']) }}><option value="osrm">OSRM</option><option value="google" disabled={!storageAvailable}>Google Routes</option></select>
      </PreferenceField>
      {googleSelected && <GoogleRoutesCredentialPanel status={credentialStatus} storageAvailable={storageAvailable} onChanged={handleCredentialChange} />}
      {routingError && <div className="form-alert" role="alert">{routingError}</div>}
      <div className="account-route-options">
        <header className="account-route-options__heading"><SlidersHorizontal size={16} aria-hidden="true" /><h4>{t('account.preferences.routeOptions')}</h4><FieldHelp>{t('account.preferences.countryNotice')}</FieldHelp></header>
        <label className="checkbox-field account-route-option"><input type="checkbox" checked={preferences.routing.stay_in_country} onChange={(event) => updateRouting('stay_in_country', event.target.checked)} /><span>{t('account.preferences.stayInCountry')}</span></label>
        {googleSelected && <><label className="checkbox-field account-route-option"><input type="checkbox" checked={preferences.routing.avoid_tolls} onChange={(event) => updateRouting('avoid_tolls', event.target.checked)} /><span>{t('account.preferences.avoidTolls')}</span></label><label className="checkbox-field account-route-option"><input type="checkbox" checked={preferences.routing.avoid_highways} onChange={(event) => updateRouting('avoid_highways', event.target.checked)} /><span>{t('account.preferences.avoidHighways')}</span></label><label className="checkbox-field account-route-option"><input type="checkbox" checked={preferences.routing.avoid_ferries} onChange={(event) => updateRouting('avoid_ferries', event.target.checked)} /><span>{t('account.preferences.avoidFerries')}</span></label>
          <PreferenceField label={t('account.preferences.traffic')} htmlFor="account-traffic" className="account-route-traffic"><select id="account-traffic" aria-labelledby="account-traffic-label" value={preferences.routing.traffic_mode} onChange={(event) => updateRouting('traffic_mode', event.target.value as AccountPreferences['routing']['traffic_mode'])}><option value="traffic_unaware">{t('account.preferences.noTraffic')}</option><option value="traffic_aware">{t('account.preferences.currentTraffic')}</option><option value="traffic_aware_optimal">{t('account.preferences.optimalTraffic')}</option></select></PreferenceField>
        </>}
      </div>
    </section>
    <div className="account-preferences-form__actions"><button className="account-button account-button--primary" type="button" onClick={savePreferences}>{t('common.save')}</button>
    <button className="account-button account-button--secondary" type="button" onClick={() => void run(async () => { apply(await resetAccountPreferences()) }, t('account.preferences.resetDone'))}>{t('account.preferences.reset')}</button>
    </div></div></>
}

function TimezoneCombobox({ value, label, onChange }: { value: string; label: string; onChange: (timezone: string) => void }) {
  const [query, setQuery] = useState(value)
  const matches = supportedTimeZones.filter((timeZone) => timeZone.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 100)
  useEffect(() => setQuery(value), [value])

  return <div className="account-preference-field account-timezone-combobox">
    <div className="account-preference-field__label"><Clock3 size={16} aria-hidden="true" /><label htmlFor="account-timezone">{label}</label></div>
    <input
      id="account-timezone"
      list="account-timezone-options"
      value={query}
      placeholder="Europe/Paris"
      autoComplete="off"
      onChange={(event) => {
        const nextValue = event.target.value
        setQuery(nextValue)
        if (supportedTimeZones.includes(nextValue)) onChange(nextValue)
      }}
      onBlur={() => setQuery(value)}
    />
    <datalist id="account-timezone-options">
      {(matches.length > 0 ? matches : [value]).map((timeZone) => <option key={timeZone} value={timeZone} />)}
    </datalist>
  </div>
}

function DangerSection({ profile, run }: { profile: AccountProfile; run: (action: () => Promise<void>, success: string) => Promise<boolean> }) {
  const [confirmation, setConfirmation] = useState(''); const [password, setPassword] = useState(''); const [acknowledged, setAcknowledged] = useState(false)
  const ready = profile.can_delete && confirmation === 'SUPPRIMER MON COMPTE' && password.length > 0 && acknowledged
  return <><AccountHeading title="Zone sensible" description="La suppression désactive et anonymise définitivement votre compte." /><div className="account-danger-summary"><p>{profile.owned_maps.length} carte(s) possédée(s), {profile.shared_map_count} carte(s) partagée(s).</p>{profile.owned_maps.length > 0 && <><strong>Transférez ou supprimez d’abord :</strong><ul>{profile.owned_maps.map((map) => <li key={map.id}>{map.name}</li>)}</ul></>}</div><form className="account-form danger" onSubmit={(event) => { event.preventDefault(); void run(async () => { await deleteOwnAccount(password, confirmation, acknowledged); window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)) }, 'Compte supprimé.') }}><label>Mot de passe actuel<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Recopiez SUPPRIMER MON COMPTE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="SUPPRIMER MON COMPTE" required /></label><label className="checkbox-field"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Je comprends que cette action est définitive.</label><button className="account-button account-button--danger" type="submit" disabled={!ready}>Supprimer mon compte</button></form></>
}

function AccountHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">Compte</p><h2>{title}</h2><span>{description}</span></header> }
function formatDate(value: string, withTime = false): string { return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(value)) }
function messageFor(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback }
