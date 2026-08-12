import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, HardDriveDownload, Image as ImageIcon, Info, KeyRound, Languages, Link, List, LockKeyhole, Mail, Map as MapIcon, MonitorSmartphone, Route, Settings2, Shield, ShieldCheck, ShieldCog, Trash2, Upload, UserRound, X, type LucideIcon } from 'lucide-react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, accountAvatarUrl, changeAccountEmail, changeAccountPassword, confirmEmailMfaSetup, confirmTotpSetup, deleteAccountAvatar, deleteOwnAccount, disableEmailMfa, disableTotp, getAccountPreferences, getAccountProfile, getAccountSessions, getEmailMfaStatus, getGooglePlacesCredential, getGoogleRoutesCredential, getOpenRouteServiceCredential, getTotpStatus, regenerateTotpRecoveryCodes, resetAccountPreferences, revokeAccountSession, revokeOtherAccountSessions, startEmailMfaSetup, startTotpSetup, updateAccountPreferences, updateAccountProfile, uploadAccountAvatar } from '../../api/account'
import { SESSION_EXPIRED_EVENT } from '../../api/client'
import { getRoutingProviders } from '../../api/routing'
import { getGoogleSatelliteStatus } from '../../api/googleSatellite'
import { useAuth } from '../../auth/useAuth'
import { notifyNotificationsChanged } from '../notifications/events'
import { clearCredentialIssue, reportCredentialIssue } from '../notifications/important'
import { useI18n } from '../../i18n/useI18n'
import { applyDisplayDensity, saveDisplayDensity } from '../../theme/displayDensity'
import type { AccountPreferences, AccountProfile, AccountSession, GooglePlacesCredentialStatus, GoogleRoutesCredentialStatus, OpenRouteServiceCredentialStatus, TotpRecoveryCodes, TotpSecurityStatus, TotpSetup } from '../../types/account'
import { FieldHelp } from '../common/FieldHelp'
import { GoogleRoutesCredentialPanel } from './GoogleRoutesCredentialPanel'
import { GooglePlacesCredentialPanel } from './GooglePlacesCredentialPanel'
import { OpenRouteServiceCredentialPanel } from './OpenRouteServiceCredentialPanel'
import { GoogleSatelliteCredentialPanel } from './GoogleSatelliteCredentialPanel'
import { GoogleSatelliteAdminPanel } from './GoogleSatelliteAdminPanel'
import { StadiaMapsCredentialPanel } from './StadiaMapsCredentialPanel'
import { StadiaPlacesCredentialPanel } from './StadiaPlacesCredentialPanel'
import { getStadiaMapsCredential, type StadiaMapsCredentialStatus } from '../../api/stadiaMaps'
import { getStadiaPlacesCredential, type StadiaPlacesCredentialStatus } from '../../api/stadiaPlaces'
import { getGoogleSatelliteCredential, type GoogleSatelliteCredentialStatus } from '../../api/googleSatellite'
import { OfflineDataSection } from './OfflineDataSection'
import { formatCredentialDate } from './credentialDate'
import { useCredentialVerificationState } from './CredentialVerificationBadge'
import { PersonalApiKeysSection } from './PersonalApiKeysSection'
import { IntegrationPreferences } from './IntegrationPreferences'

type Section = 'profile' | 'security' | 'preferences' | 'api_keys' | 'offline'

const emptyPreferences: AccountPreferences = { language: 'fr', preferred_basemap: 'cartavault-light', density: 'compact', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm' }, places: { provider: 'stadia' } }

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
  const [, setGoogleSatelliteAvailable] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [apiKeysDirty, setApiKeysDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const modal = useRef<HTMLElement>(null)
  const profileDirty = profile !== null && draftName.trim() !== profile.display_name
  const dirty = profileDirty || apiKeysDirty
  const dirtyRef = useRef(false)
  const closeRef = useRef(onClose)
  dirtyRef.current = dirty
  closeRef.current = onClose
  translationRef.current = t
  const avatar = accountAvatarUrl(profile?.avatar_url ?? user?.avatar_url ?? null)
  const initials = (profile?.display_name ?? user?.display_name ?? '?').trim().charAt(0).toUpperCase()

  const load = async () => {
    const [nextProfile, nextSessions, nextPreferences, satelliteStatus] = await Promise.all([
      getAccountProfile(),
      getAccountSessions(),
      getAccountPreferences(),
      getGoogleSatelliteStatus().catch(() => ({ available: false, warning_level: 0 })),
    ])
    setProfile(nextProfile); setDraftName(nextProfile.display_name); setSessions(nextSessions); setPreferences(nextPreferences)
    setGoogleSatelliteAvailable(satelliteStatus.available)
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
        if (document.querySelector('.account-security-dialog[aria-modal="true"]')) return
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
  useEffect(() => {
    const closeFromMobileNavigation = () => requestClose()
    window.addEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
    return () => window.removeEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
  }, [requestClose])
  const selectSection = (next: Section) => {
    if (next === section) return
    if (dirty && !window.confirm(t('account.discard'))) return
    if (profileDirty && profile) setDraftName(profile.display_name)
    if (apiKeysDirty) {
      setApiKeysDirty(false)
      void getAccountPreferences().then(setPreferences).catch(() => undefined)
    }
    setSection(next)
  }
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
          <button ref={closeButton} className="panel-icon-button modal-header-close" type="button" aria-label={t('account.close')} onClick={requestClose}><X size={14} /></button>
        </header>
        <nav className="account-modal__nav" aria-label={t('account.navigation')}>
          {([[ 'profile', UserRound, t('account.profile') ], [ 'security', ShieldCog, t('account.security') ], [ 'preferences', Settings2, t('account.preferences') ], [ 'api_keys', KeyRound, t('account.apiKeys') ], [ 'offline', HardDriveDownload, t('account.offline') ]] as const).map(([id, Icon, label]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => selectSection(id)}><Icon size={17} />{label}</button>)}
        </nav>
        <main className="account-modal__content">
          {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}
          {section === 'profile' && profile && <ProfileSection profile={profile} avatar={avatar} initials={initials} draftName={draftName} dirty={profileDirty} setDraftName={setDraftName} saveProfile={saveProfile} uploadAvatar={uploadAvatar} removeAvatar={() => run(async () => { await deleteAccountAvatar(); await refresh(); await load() }, 'Avatar supprimé.')} />}
          {section === 'security' && profile && <SecuritySection profile={profile} sessions={sessions} run={run} refreshProfile={async () => { await refresh(); await load() }} reload={load} />}
          {section === 'preferences' && <PreferencesSection preferences={preferences} setPreferences={setPreferences} run={run} />}
          {section === 'api_keys' && <PersonalApiKeysSection />}
          {section === 'offline' && <OfflineDataSection />}
        </main>
      </section>
    </div>, document.body,
  )
}

function ProfileSection({ profile, avatar, initials, draftName, dirty, setDraftName, saveProfile, uploadAvatar, removeAvatar }: { profile: AccountProfile; avatar: string | null; initials: string; draftName: string; dirty: boolean; setDraftName: (name: string) => void; saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>; uploadAvatar: (file: File) => Promise<void>; removeAvatar: () => Promise<boolean> }) {
  return <><AccountHeading title="Profil" description="Gérez votre identité CartaVault et votre avatar." />
    <div className="account-profile-grid">
      <form className="account-form account-preference-card account-profile-card" onSubmit={saveProfile}>
        <PreferenceCardHeading icon={UserRound} title="Informations de profil" />
        <div className="account-profile-field"><label htmlFor="account-display-name">Nom d’affichage</label><input id="account-display-name" name="display_name" value={draftName} placeholder="Votre nom d’affichage" required maxLength={120} onChange={(event) => setDraftName(event.target.value)} /></div>
        <button className="account-button account-button--primary" type="submit" disabled={!dirty}>Enregistrer</button>
      </form>
      <section className="account-preference-card account-avatar-editor">
        <PreferenceCardHeading icon={ImageIcon} title="Avatar" />
        <p className="account-card-description">Une image carrée, traitée et stockée séparément de vos photos de lieux.</p>
        <div className="account-avatar-editor__content">
          <div className="account-avatar large">{avatar ? <img src={avatar} alt="Aperçu de l’avatar" /> : initials}</div>
          <div className="account-avatar-editor__actions"><label className="account-button account-button--secondary"><Upload size={15} />Importer une image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.currentTarget.value = '' }} /></label>{avatar && <button className="account-button account-button--danger-quiet" type="button" onClick={() => void removeAvatar()}><Trash2 size={15} />Supprimer</button>}</div>
        </div>
        <small>JPEG, PNG ou WebP · 5 Mio maximum.</small>
      </section>
    </div>
    <section className="account-preference-card account-profile-metadata-card">
      <PreferenceCardHeading icon={Info} title="Informations du compte" />
      <dl className="account-metadata">
        <div><dt><Mail size={15} aria-hidden="true" />Adresse e-mail</dt><dd>{profile.email}</dd></div>
        <div><dt><CalendarDays size={15} aria-hidden="true" />Compte créé</dt><dd>{formatDate(profile.created_at)}</dd></div>
        <div><dt><Clock3 size={15} aria-hidden="true" />Dernière connexion</dt><dd>{profile.last_login_at ? formatDate(profile.last_login_at, true) : 'Non disponible'}</dd></div>
        <div><dt><MapIcon size={15} aria-hidden="true" />Cartes possédées</dt><dd>{profile.owned_maps.length}</dd></div>
      </dl>
    </section>
  </>
}

type EmailMfaStatus = { enabled: boolean; verified_at: string | null; available: boolean }
type SecurityDialogKind = 'email' | 'password' | 'totp' | 'email-mfa' | 'recovery' | 'sessions' | 'delete'

function SecuritySection({ profile, sessions, run, refreshProfile, reload }: { profile: AccountProfile; sessions: AccountSession[]; run: (action: () => Promise<void>, success: string) => Promise<boolean>; refreshProfile: () => Promise<void>; reload: () => Promise<void> }) {
  const [dialog, setDialog] = useState<SecurityDialogKind | null>(null)
  const [totpStatus, setTotpStatus] = useState<TotpSecurityStatus | null>(null)
  const [emailMfaStatus, setEmailMfaStatus] = useState<EmailMfaStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void Promise.all([getTotpStatus(), getEmailMfaStatus()])
      .then(([totp, email]) => { if (active) { setTotpStatus(totp); setEmailMfaStatus(email); setStatusError(null) } })
      .catch(() => { if (active) setStatusError('Impossible de charger l’état de sécurité du compte.') })
    return () => { active = false }
  }, [])
  const mfaEnabled = Boolean(totpStatus?.enabled || emailMfaStatus?.enabled)
  const closeDialog = () => setDialog(null)
  return <section className="account-security-dashboard">
    <AccountHeading title="Sécurité" description="Gérez la sécurité, les accès et les appareils associés à votre compte." />
    <section className="account-security-summary" aria-label="Résumé du niveau de sécurité">
      <div className="account-api-summary account-security-summary__grid">
        <SecuritySummaryItem icon={ShieldCheck} label="Compte" value={profile.is_active ? 'Actif' : 'Inactif'} tone={profile.is_active ? 'success' : 'danger'} />
        <SecuritySummaryItem icon={Mail} label="E-mail" value={profile.email_verified ? 'Vérifié' : 'À vérifier'} tone={profile.email_verified ? 'success' : 'warning'} />
        <SecuritySummaryItem icon={MonitorSmartphone} label="Sessions actives" value={String(profile.active_session_count)} tone="success" />
        <SecuritySummaryItem icon={LockKeyhole} label="Authentification MFA" value={mfaEnabled ? 'Activée' : 'Non activée'} tone={mfaEnabled ? 'success' : 'warning'} />
      </div>
      {statusError && <p className="form-alert" role="alert">{statusError}</p>}
    </section>

    <section className="account-security-block" aria-labelledby="security-access-title">
      <SecuritySectionTitle id="security-access-title" icon={UserRound}>Identité et accès</SecuritySectionTitle>
      <div className="account-security-access-grid">
        <SecurityActionCard icon={Mail} title="Adresse e-mail" description="Votre adresse e-mail actuelle" detail={profile.email} action="Changer l’adresse e-mail" onClick={() => setDialog('email')} />
        <SecurityActionCard icon={LockKeyhole} title="Mot de passe" description="Assurez la sécurité de votre compte avec un mot de passe fort et unique." action="Changer le mot de passe" onClick={() => setDialog('password')} />
      </div>
    </section>

    <section className="account-security-block" aria-labelledby="security-mfa-title">
      <SecuritySectionTitle id="security-mfa-title" icon={ShieldCheck}>Authentification renforcée</SecuritySectionTitle>
      <div className="account-security-action-list">
        <SecurityActionRow icon={LockKeyhole} title="Application d’authentification (TOTP)" description="Utilisez une application comme Google Authenticator ou Authy." status={totpStatus?.enabled ? 'Configurée' : 'Non configurée'} tone={totpStatus?.enabled ? 'success' : 'warning'} action={totpStatus?.enabled ? 'Gérer' : 'Configurer'} primary={!totpStatus?.enabled} disabled={Boolean(emailMfaStatus?.enabled)} disabledTitle={emailMfaStatus?.enabled ? 'Désactivez d’abord le code par e-mail.' : undefined} onClick={() => setDialog('totp')} />
        <SecurityActionRow icon={Mail} title="Code par e-mail" description="Recevez un code de sécurité à chaque connexion." status={emailMfaStatus?.enabled ? 'Activé' : emailMfaStatus?.available ? 'Disponible' : 'Indisponible'} tone={emailMfaStatus?.enabled ? 'success' : emailMfaStatus?.available ? 'success' : 'muted'} action={emailMfaStatus?.enabled ? 'Gérer' : 'Activer'} disabled={!emailMfaStatus?.available || Boolean(totpStatus?.enabled)} disabledTitle={totpStatus?.enabled ? 'Désactivez d’abord l’authentification TOTP.' : !emailMfaStatus?.available ? 'Configurez un service d’envoi d’e-mails dans CartaVault.' : undefined} onClick={() => setDialog('email-mfa')} />
        <SecurityActionRow icon={ShieldCheck} title="Codes de récupération" description="Utilisez ces codes pour récupérer l’accès à votre compte." status={totpStatus?.enabled ? `${totpStatus.recovery_codes_remaining} restant${totpStatus.recovery_codes_remaining > 1 ? 's' : ''}` : 'Non générés'} tone={totpStatus?.enabled ? 'success' : 'muted'} action="Régénérer" disabled={!totpStatus?.enabled} disabledTitle={!totpStatus?.enabled ? 'Configurez d’abord l’authentification TOTP.' : undefined} onClick={() => setDialog('recovery')} />
      </div>
    </section>

    <section className="account-security-sessions">
      <span className="account-security-section-title__icon"><MonitorSmartphone size={19} /></span><div><h3>Sessions et appareils</h3><p>Consultez et gérez les appareils connectés à votre compte.</p></div><button className="account-button account-button--secondary" type="button" onClick={() => setDialog('sessions')}>Gérer les sessions<ChevronRight size={16} /></button>
    </section>
    <section className="account-security-danger">
      <span className="account-security-section-title__icon"><AlertTriangle size={19} /></span><div><h3>Zone sensible</h3><p>Ces actions sont irréversibles. Veuillez procéder avec prudence.</p></div><button className="account-button account-button--danger" type="button" onClick={() => setDialog('delete')}>Supprimer le compte</button>
    </section>

    {dialog === 'email' && <AccountSecurityDialog icon={Mail} title="Changer l’adresse e-mail" onClose={closeDialog}><EmailChangePanel run={run} refreshProfile={refreshProfile} onComplete={closeDialog} /></AccountSecurityDialog>}
    {dialog === 'password' && <AccountSecurityDialog icon={LockKeyhole} title="Changer le mot de passe" onClose={closeDialog}><PasswordChangePanel run={run} onComplete={closeDialog} /></AccountSecurityDialog>}
    {dialog === 'totp' && totpStatus && <AccountSecurityDialog icon={LockKeyhole} title="Application d’authentification (TOTP)" onClose={closeDialog}><TotpSection status={totpStatus} run={run} onStatusChange={setTotpStatus} /></AccountSecurityDialog>}
    {dialog === 'email-mfa' && emailMfaStatus && <AccountSecurityDialog icon={Mail} title="Code par e-mail" onClose={closeDialog}><EmailMfaSection status={emailMfaStatus} run={run} onStatusChange={setEmailMfaStatus} /></AccountSecurityDialog>}
    {dialog === 'recovery' && totpStatus?.enabled && <AccountSecurityDialog icon={ShieldCheck} title="Régénérer les codes de récupération" onClose={closeDialog}><RecoveryCodesPanel status={totpStatus} onStatusChange={setTotpStatus} /></AccountSecurityDialog>}
    {dialog === 'sessions' && <AccountSecurityDialog icon={MonitorSmartphone} title="Sessions et appareils" onClose={closeDialog} wide><SessionsSection sessions={sessions} run={run} reload={reload} embedded /></AccountSecurityDialog>}
    {dialog === 'delete' && <AccountSecurityDialog icon={AlertTriangle} title="Supprimer le compte" onClose={closeDialog}><DangerSection profile={profile} run={run} embedded /></AccountSecurityDialog>}
  </section>
}

function SecuritySectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  return <header className="account-security-section-title"><span className="account-security-section-title__icon"><Icon size={19} /></span><h2 id={id}>{children}</h2></header>
}

function SecuritySummaryItem({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'success' | 'warning' | 'danger' }) {
  const apiTone: ApiServiceTone = tone === 'success' ? 'success' : tone === 'danger' ? 'error' : 'warning'
  return <article className="account-api-summary__item"><span className="account-api-summary__icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{label}</strong><ApiServiceBadge state={{ label: value, tone: apiTone, date: null }} /></div></article>
}

function SecurityActionCard({ icon: Icon, title, description, detail, action, onClick }: { icon: LucideIcon; title: string; description: string; detail?: string; action: string; onClick: () => void }) {
  return <article><div className="account-security-action-card__body"><Icon size={20} /><div><h3>{title}</h3><p>{description}</p>{detail && <strong>{detail}</strong>}</div></div><button className="account-security-action-card__button" type="button" onClick={onClick}>{action}<ChevronRight size={16} /></button></article>
}

function SecurityActionRow({ icon: Icon, title, description, status, tone, action, primary = false, disabled = false, disabledTitle, onClick }: { icon: LucideIcon; title: string; description: string; status: string; tone: 'success' | 'warning' | 'muted'; action: string; primary?: boolean; disabled?: boolean; disabledTitle?: string; onClick: () => void }) {
  const apiTone: ApiServiceTone = tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'neutral'
  return <article title={disabledTitle}><span className="account-security-action-row__icon"><Icon size={18} /></span><div><h3>{title}</h3><p>{description}</p></div><ApiServiceBadge state={{ label: status, tone: apiTone, date: null }} /><button className={`account-button ${primary ? 'account-button--primary' : 'account-button--secondary'}`} type="button" disabled={disabled} onClick={onClick}>{action}</button><ChevronRight size={16} aria-hidden="true" /></article>
}

function AccountSecurityDialog({ icon: Icon, title, onClose, wide = false, children }: { icon: LucideIcon; title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const titleId = `account-security-dialog-${title.toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, '-')}`
  return createPortal(<div className="account-security-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`account-security-dialog${wide ? ' account-security-dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><span><Icon size={19} /></span><div><p>SÉCURITÉ</p><h2 id={titleId}>{title}</h2></div><button ref={closeButton} className="panel-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={16} /></button></header><div className="account-security-dialog__content">{children}</div></section></div>, document.body)
}

function EmailChangePanel({ run, refreshProfile, onComplete }: { run: (action: () => Promise<void>, success: string) => Promise<boolean>; refreshProfile: () => Promise<void>; onComplete: () => void }) {
  return <form className="account-form account-security-dialog__form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await changeAccountEmail(String(data.get('current_password')), String(data.get('new_email'))); await refreshProfile() }, 'Adresse e-mail mise à jour.').then((ok) => { if (ok) { form.reset(); onComplete() } }) }}><p className="account-card-description">Mettez à jour l’adresse e-mail associée à votre compte.</p><label>Nouvelle adresse<input name="new_email" type="email" placeholder="exemple@domaine.com" required /></label><label>Mot de passe actuel<input name="current_password" type="password" placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" /></label><div className="dialog-actions"><button className="account-button account-button--primary" type="submit">Modifier l’e-mail</button></div></form>
}

function PasswordChangePanel({ run, onComplete }: { run: (action: () => Promise<void>, success: string) => Promise<boolean>; onComplete: () => void }) {
  return <form className="account-form account-security-dialog__form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(() => changeAccountPassword(String(data.get('current_password')), String(data.get('new_password')), String(data.get('confirmation'))), 'Mot de passe mis à jour.').then((ok) => { if (ok) { form.reset(); onComplete() } }) }}><p className="account-card-description">Choisissez un mot de passe fort et unique.</p><label>Mot de passe actuel<input name="current_password" type="password" placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" /></label><label>Nouveau mot de passe<input name="new_password" type="password" placeholder="Minimum 12 caractères" minLength={12} required autoComplete="new-password" /></label><label>Confirmation<input name="confirmation" type="password" placeholder="Confirmez votre nouveau mot de passe" minLength={12} required autoComplete="new-password" /></label><div className="dialog-actions"><button className="account-button account-button--primary" type="submit">Modifier le mot de passe</button></div></form>
}

function EmailMfaSection({ status, run, onStatusChange }: { status: EmailMfaStatus; run: (action: () => Promise<void>, success: string) => Promise<boolean>; onStatusChange: (status: EmailMfaStatus) => void }) {
  const [password, setPassword] = useState(''); const [challenge, setChallenge] = useState(''); const [code, setCode] = useState(''); const [error, setError] = useState<string | null>(null)
  return <section className="account-security-dialog__form">{!status.available && <p className="account-card-description">Disponible lorsque Resend ou SMTP est configuré.</p>}{!status.enabled && status.available && !challenge && <><p className="account-card-description">Recevez un code de sécurité à chaque connexion. Cette méthode remplace le TOTP et ne peut pas être active en même temps.</p><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="account-button account-button--primary" type="button" disabled={!password} onClick={() => void startEmailMfaSetup(password).then((value) => { setChallenge(value.challenge_token); setError(null) }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Activation impossible.'))}>Envoyer un code</button></>}{challenge && <><p className="account-card-description">Saisissez le code envoyé à votre adresse e-mail.</p><label>Code reçu par e-mail *<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="account-button account-button--primary" type="button" disabled={!code} onClick={() => void confirmEmailMfaSetup(challenge, code).then(() => { const next = { ...status, enabled: true, verified_at: new Date().toISOString() }; onStatusChange(next); setChallenge(''); notifyNotificationsChanged() }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Code invalide.'))}>Vérifier et activer</button></>}{status.enabled && <><p className="account-card-description">Activée{status.verified_at ? ` le ${formatDate(status.verified_at)}` : ''}.</p><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="account-button account-button--danger-hover" type="button" disabled={!password} onClick={() => void run(() => disableEmailMfa(password), 'Authentification e-mail désactivée.').then((ok) => { if (ok) { onStatusChange({ ...status, enabled: false, verified_at: null }); notifyNotificationsChanged() } })}>Désactiver</button></>}{error && <p className="form-alert" role="alert">{error}</p>}</section>
}

function TotpSection({ status, run, onStatusChange }: { status: TotpSecurityStatus; run: (action: () => Promise<void>, success: string) => Promise<boolean>; onStatusChange: (status: TotpSecurityStatus) => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<TotpRecoveryCodes | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Copiez la valeur affichée manuellement.') } }
  return <section className="account-security-dialog__form">
    {!status.enabled && !setup && <><p className="account-card-description">{error ?? 'Protégez votre compte avec une application d’authentification compatible TOTP.'}</p><button className="account-button account-button--primary" type="button" onClick={() => void startTotpSetup().then((value) => { setSetup(value); setError(null) }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Impossible de démarrer la configuration.'))}>Activer l’authentification à deux facteurs</button></>}
    {setup && !recovery && <><p className="account-card-description">Scannez le QR Code ou ajoutez la clé dans votre application, puis saisissez le code généré.</p><div className="totp-setup"><img className="totp-qr-code" src={setup.qr_code_data_url} alt="Code QR de configuration CartaVault" /><div className="totp-setup__key"><span>Clé de configuration</span><code>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code><div><button className="panel-icon-button" type="button" title="Copier la clé" aria-label="Copier la clé" onClick={() => void copy(setup.secret)}><Copy size={15} /></button><button className="panel-icon-button" type="button" title="Copier le lien de configuration" aria-label="Copier le lien de configuration" onClick={() => void copy(setup.provisioning_uri)}><Link size={15} /></button></div></div></div><label className="totp-setup__code">Code à 6 chiffres *<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} /></label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="account-button account-button--primary" type="button" disabled={!code} onClick={() => void confirmTotpSetup(code).then((value) => { setRecovery(value); setSetup(null); onStatusChange({ ...status, enabled: true, verified_at: new Date().toISOString(), recovery_codes_remaining: value.recovery_codes.length }); notifyNotificationsChanged() }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Code invalide.'))}>Vérifier et activer</button></>}
    {recovery && <><p className="form-alert">Enregistrez ces codes maintenant. Ils ne seront plus affichés.</p><pre className="totp-recovery-codes">{recovery.recovery_codes.join('\n')}</pre><button className="account-button account-button--secondary" type="button" onClick={() => void copy(recovery.recovery_codes.join('\n'))}>Copier tous les codes</button></>}
    {status.enabled && !recovery && <><p className="account-card-description">Activée{status.verified_at ? ` le ${formatDate(status.verified_at)}` : ''}. {status.recovery_codes_remaining} code(s) de récupération restant(s).</p><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Code d’authentification *<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="account-button account-button--danger-hover" type="button" disabled={!password || !code} onClick={() => void run(() => disableTotp(password, code), 'Authentification à deux facteurs désactivée.').then((ok) => { if (ok) { onStatusChange({ enabled: false, verified_at: null, recovery_codes_remaining: 0 }); notifyNotificationsChanged() } })}>Désactiver</button></>}
  </section>
}

function RecoveryCodesPanel({ status, onStatusChange }: { status: TotpSecurityStatus; onStatusChange: (status: TotpSecurityStatus) => void }) {
  const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [recovery, setRecovery] = useState<TotpRecoveryCodes | null>(null); const [error, setError] = useState<string | null>(null)
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Copiez les codes affichés manuellement.') } }
  return <section className="account-security-dialog__form"><p className="account-card-description">La régénération invalide immédiatement tous les anciens codes de récupération.</p>{!recovery && <><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Code d’authentification *<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="account-button account-button--primary" type="button" disabled={!password || !code} onClick={() => void regenerateTotpRecoveryCodes(password, code).then((value) => { setRecovery(value); onStatusChange({ ...status, recovery_codes_remaining: value.recovery_codes.length }) }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Impossible de régénérer les codes.'))}>Régénérer les codes</button></>}{recovery && <><p className="form-alert">Enregistrez ces codes maintenant. Ils ne seront plus affichés.</p><pre className="totp-recovery-codes">{recovery.recovery_codes.join('\n')}</pre><button className="account-button account-button--secondary" type="button" onClick={() => void copy(recovery.recovery_codes.join('\n'))}>Copier tous les codes</button></>}{error && <p className="form-alert" role="alert">{error}</p>}</section>
}

function SessionsSection({ sessions, run, reload, embedded = false }: { sessions: AccountSession[]; run: (action: () => Promise<void>, success: string) => Promise<boolean>; reload: () => Promise<void>; embedded?: boolean }) {
  return <>{!embedded && <AccountHeading title="Sessions actives" description="Contrôlez les appareils connectés à votre compte." />}<div className="account-security-dialog__sessions-actions"><p className="account-card-description">Contrôlez les appareils actuellement connectés à votre compte.</p><button className="account-button account-button--secondary account-button--danger-hover" type="button" onClick={() => void run(async () => { await revokeOtherAccountSessions(); await reload() }, 'Autres sessions révoquées.')}>Révoquer les autres sessions</button></div>{sessions.length === 0 ? <p className="account-info">Aucune session active.</p> : <ul className="account-sessions">{sessions.map((item) => <li key={item.id}><MonitorSmartphone size={19} /><div><strong>{item.user_agent || 'Appareil inconnu'}</strong><span>Dernière activité : {formatDate(item.last_used_at, true)}</span>{item.is_current && <b>Session actuelle</b>}</div>{!item.is_current && <button className="panel-icon-button danger" type="button" aria-label="Révoquer cette session" onClick={() => void run(async () => { await revokeAccountSession(item.id); await reload() }, 'Session révoquée.')}><Trash2 size={15} /></button>}</li>)}</ul>}</>
}

function PreferenceCardHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  const displayTitle = title === 'Authentification à deux facteurs' ? 'Méthode par OTP' : title === 'Authentification à deux facteurs par e-mail' ? 'Authentification par e-mail' : title
  return <header className="account-preference-card__heading"><span className="account-preference-card__icon"><Icon size={19} aria-hidden="true" /></span><h3>{displayTitle}</h3></header>
}

type ApiServiceId = 'routing' | 'places' | 'maps'
type ApiServiceTone = 'success' | 'error' | 'warning' | 'neutral' | 'loading'
type ApiServiceState = { label: string; tone: ApiServiceTone; date: string | null }
type ApiCredentialStatus = { configured: boolean; verified: boolean; verified_at: string | null; last_error_code: string | null }

function credentialServiceState(status: ApiCredentialStatus, optional = false, failedAt: string | null = null): ApiServiceState {
  if (status.last_error_code || failedAt) return { label: 'Erreur', tone: 'error', date: failedAt ?? status.verified_at }
  if (status.verified) return { label: 'Vérifiée', tone: 'success', date: status.verified_at }
  if (!status.configured && optional) return { label: 'Opérationnel', tone: 'success', date: null }
  return { label: status.configured ? 'À vérifier' : 'Non configurée', tone: 'neutral', date: null }
}

function ApiServiceBadge({ state }: { state: ApiServiceState }) {
  const Icon = state.tone === 'success' ? CheckCircle2 : state.tone === 'error' || state.tone === 'warning' ? AlertTriangle : KeyRound
  return <span className={`account-api-service-badge is-${state.tone}`}><Icon size={13} aria-hidden="true" />{state.label}</span>
}

function ApiKeyGroup({ id, icon: Icon, title, modifier, providerLabel, state, expanded, onToggle, children }: { id: ApiServiceId; icon: LucideIcon; title: string; modifier: string; providerLabel: string; state: ApiServiceState; expanded: boolean; onToggle: (id: ApiServiceId) => void; children: ReactNode }) {
  return <section className={`account-preference-card account-preference-card--${modifier} account-api-key-group${expanded ? ' account-api-key-group--expanded' : ''}`}>
    <button className="account-api-key-group__toggle" type="button" aria-label={title} aria-expanded={expanded} aria-controls={`account-api-${id}-content`} onClick={() => onToggle(id)}>
      <span className="account-preference-card__icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="account-api-key-group__identity"><h3>{title}</h3><span>Fournisseur : {providerLabel}</span></span>
      <span className="account-api-key-group__state"><ApiServiceBadge state={state} />{state.date && <time dateTime={state.date}>{formatCredentialDate(state.date)}</time>}</span>
      <ChevronDown size={18} aria-hidden="true" />
    </button>
    {expanded && <div id={`account-api-${id}-content`} className="account-api-key-group__content">{children}</div>}
  </section>
}

function ApiProviderCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="account-api-provider-card"><div><h4>{title}</h4><p>{description}</p></div>{children}</section>
}

function PreferenceField({ icon: Icon, label, htmlFor, help, children, className = '' }: { icon?: LucideIcon; label: string; htmlFor: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={`account-preference-field ${className}`.trim()}>
    <div className="account-preference-field__label">{Icon && <Icon size={16} aria-hidden="true" />}<label id={`${htmlFor}-label`} htmlFor={htmlFor}>{label}</label>{help && <FieldHelp>{help}</FieldHelp>}</div>
    {children}
  </div>
}

function PreferencesSection({ preferences, setPreferences, run }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void; run: (action: () => Promise<void>, success: string) => Promise<boolean> }) {
  const { setLocale, t } = useI18n()
  const update = <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => setPreferences({ ...preferences, [key]: value })
  const apply = (next: AccountPreferences) => { setPreferences(next); window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next })) }
  const savePreferences = () => { void run(async () => { apply(await updateAccountPreferences(preferences)) }, t('account.preferences.saved')) }
  return <><AccountHeading title={t('account.preferences.title')} description={t('account.preferences.description')} /><div className="account-form account-preferences-form">
    <section className="account-preference-card">
      <PreferenceCardHeading icon={Settings2} title={t('account.preferences.general')} />
      <div className="account-preference-grid">
        <PreferenceField icon={Languages} label={t('common.language')} htmlFor="account-language" help={t('account.preferences.languageHelp')}>
          <select id="account-language" aria-labelledby="account-language-label" value={preferences.language} onChange={(event) => { const language = event.target.value as AccountPreferences['language']; update('language', language); setLocale(language) }}><option value="fr">{t('common.french')}</option><option value="en">{t('common.english')}</option></select>
        </PreferenceField>
        <PreferenceField icon={MapIcon} label={t('account.preferences.basemap')} htmlFor="account-basemap">
          <select id="account-basemap" aria-labelledby="account-basemap-label" value={preferences.preferred_basemap} onChange={(event) => update('preferred_basemap', event.target.value as AccountPreferences['preferred_basemap'])}><option value="cartavault-light">{t('common.light')}</option><option value="cartavault-dark">{t('common.dark')}</option><option value={(preferences.basemaps?.satellite_provider ?? (preferences.preferred_basemap === 'google-satellite' ? 'google' : 'stadia')) === 'google' ? 'google-satellite' : 'satellite'}>Satellite</option><option value="osm">OpenStreetMap</option></select>
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
    <IntegrationPreferences preferences={preferences} setPreferences={setPreferences} />
    <div className="account-preferences-form__actions"><button className="account-button account-button--primary" type="button" onClick={savePreferences}>{t('common.save')}</button>
    <button className="account-button account-button--secondary" type="button" onClick={() => void run(async () => { apply(await resetAccountPreferences()) }, t('account.preferences.resetDone'))}>{t('account.preferences.reset')}</button>
  </div></div></>
}

export function ApiKeysSection({ preferences, setPreferences, onDirtyChange, onSatelliteAvailabilityChanged, isAdmin }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void; onDirtyChange: (dirty: boolean) => void; onSatelliteAvailabilityChanged: (available: boolean) => void; isAdmin: boolean }) {
  const { t } = useI18n()
  const emptyCredential = { configured: false, last4: null, verified: false, verified_at: null, last_used_at: null, last_error_code: null }
  const [routes, setRoutes] = useState<GoogleRoutesCredentialStatus>(emptyCredential)
  const [ors, setOrs] = useState<OpenRouteServiceCredentialStatus>({ ...emptyCredential, self_hosted: false })
  const [places, setPlaces] = useState<GooglePlacesCredentialStatus>(emptyCredential)
  const [stadiaPlaces, setStadiaPlaces] = useState<StadiaPlacesCredentialStatus>(emptyCredential)
  const [satellite, setSatellite] = useState<GoogleSatelliteCredentialStatus>(emptyCredential)
  const [stadiaMaps, setStadiaMaps] = useState<StadiaMapsCredentialStatus>(emptyCredential)
  const [storageAvailable, setStorageAvailable] = useState(false)
  const [orsAvailable, setOrsAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<ApiServiceId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const routesVerification = useCredentialVerificationState('google_routes', routes.last4, routes.last_error_code)
  const orsVerification = useCredentialVerificationState('openrouteservice', ors.last4, ors.last_error_code)
  const placesVerification = useCredentialVerificationState('google_places', places.last4, places.last_error_code)
  const stadiaPlacesVerification = useCredentialVerificationState('stadia_places', stadiaPlaces.last4, stadiaPlaces.last_error_code)
  const satelliteVerification = useCredentialVerificationState('google_map_tiles', satellite.last4, satellite.last_error_code)
  const stadiaMapsVerification = useCredentialVerificationState('stadia_maps', stadiaMaps.last4, stadiaMaps.last_error_code)
  const providerSignature = `${preferences.routing.provider}|${preferences.places.provider}|${preferences.basemaps?.satellite_provider ?? (preferences.preferred_basemap === 'google-satellite' ? 'google' : 'stadia')}`
  const savedProviderSignature = useRef(providerSignature)

  useEffect(() => { onDirtyChange(providerSignature !== savedProviderSignature.current) }, [onDirtyChange, providerSignature])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      getRoutingProviders(controller.signal),
      getGoogleRoutesCredential(controller.signal),
      getOpenRouteServiceCredential(controller.signal),
      getGooglePlacesCredential(controller.signal),
      getStadiaPlacesCredential(controller.signal),
      getGoogleSatelliteCredential(controller.signal),
      getStadiaMapsCredential(controller.signal),
    ]).then(([providers, routesStatus, orsStatus, placesStatus, stadiaPlacesStatus, satelliteStatus, stadiaMapsStatus]) => {
      if (controller.signal.aborted) return
      setStorageAvailable(providers.credential_storage_available)
      setOrsAvailable(providers.providers.some((provider) => provider.id === 'openrouteservice' && (provider.available || providers.credential_storage_available)))
      setRoutes(routesStatus); setOrs(orsStatus); setPlaces(placesStatus); setStadiaPlaces(stadiaPlacesStatus); setSatellite(satelliteStatus); setStadiaMaps(stadiaMapsStatus)
      setLoading(false)
      ;([
        ['google_routes', 'Google Routes', routesStatus],
        ['openrouteservice', 'OpenRouteService', orsStatus],
        ['google_places', 'Google Places', placesStatus],
        ['stadia_places', 'Stadia Places', stadiaPlacesStatus],
        ['google_map_tiles', 'Google Map Tiles', satelliteStatus],
        ['stadia_maps', 'Stadia Maps', stadiaMapsStatus],
      ] as const).forEach(([provider, label, status]) => {
        if (status.configured && status.last_error_code) reportCredentialIssue(provider, `La clé API ${label} ne fonctionne plus. Vérifiez-la ou remplacez-la.`)
        else clearCredentialIssue(provider)
      })
    }).catch((reason) => { if (!controller.signal.aborted) { setLoading(false); setError(reason instanceof Error ? reason.message : t('account.loadError')) } })
    return () => controller.abort()
  }, [t])

  const resetRouting = (reset?: boolean) => { if (reset) setPreferences({ ...preferences, routing: { ...preferences.routing, provider: 'osrm' } }) }
  const resetPlaces = (reset?: boolean) => { if (reset) setPreferences({ ...preferences, places: { provider: 'stadia' } }) }
  const resetBasemap = (reset?: boolean) => { if (reset) setPreferences({ ...preferences, preferred_basemap: 'cartavault-light' }) }
  const refreshSatelliteAvailability = () => { void getGoogleSatelliteStatus().then((status) => onSatelliteAvailabilityChanged(status.available)).catch(() => onSatelliteAvailabilityChanged(false)) }
  const updateRouting = <K extends keyof AccountPreferences['routing']>(key: K, value: AccountPreferences['routing'][K]) => setPreferences({ ...preferences, routing: { ...preferences.routing, [key]: value } })
  const googleSelected = preferences.routing.provider === 'google'
  const satelliteProvider = preferences.basemaps?.satellite_provider ?? (preferences.preferred_basemap === 'google-satellite' ? 'google' : 'stadia')
  const loadingState: ApiServiceState = { label: 'Chargement', tone: 'loading', date: null }
  const routingState = loading ? loadingState : preferences.routing.provider === 'osrm'
    ? { label: 'Opérationnel', tone: 'success', date: null } satisfies ApiServiceState
    : preferences.routing.provider === 'openrouteservice' && ors.self_hosted && !ors.configured
      ? { label: 'Opérationnel', tone: 'success', date: null } satisfies ApiServiceState
      : preferences.routing.provider === 'google'
        ? credentialServiceState(routes, false, routesVerification.failedAt)
        : credentialServiceState(ors, false, orsVerification.failedAt)
  const placesState = loading ? loadingState : preferences.places.provider === 'google'
    ? credentialServiceState(places, false, placesVerification.failedAt)
    : credentialServiceState(stadiaPlaces, true, stadiaPlacesVerification.failedAt)
  const mapsState = loading ? loadingState : satelliteProvider === 'google'
    ? credentialServiceState(satellite, false, satelliteVerification.failedAt)
    : credentialServiceState(stadiaMaps, true, stadiaMapsVerification.failedAt)
  const serviceStates: Array<{ id: ApiServiceId; title: string; icon: LucideIcon; state: ApiServiceState }> = [
    { id: 'routing', title: t('account.apiKeys.routing'), icon: Route, state: routingState },
    { id: 'places', title: t('account.apiKeys.places'), icon: MapIcon, state: placesState },
    { id: 'maps', title: t('account.apiKeys.maps'), icon: ImageIcon, state: mapsState },
  ]
  const credentials = [routes, ors, places, stadiaPlaces, satellite, stadiaMaps]
  const configuredCount = credentials.filter((status) => status.configured).length
  const verifiedCount = credentials.filter((status) => status.configured && status.verified).length
  const credentialErrorCount = credentials.filter((status) => status.configured && Boolean(status.last_error_code)).length
  const routingProviderLabel = preferences.routing.provider === 'google' ? 'Google Routes' : preferences.routing.provider === 'openrouteservice' ? 'OpenRouteService' : 'OSRM'
  const placesProviderLabel = preferences.places.provider === 'google' ? 'Google Places' : 'Stadia Places'
  const mapsProviderLabel = satelliteProvider === 'google' ? 'Google Map Tiles' : 'Stadia Maps'

  useEffect(() => {
    if (loading || expandedGroup !== null) return
    if (routingState.tone === 'error') setExpandedGroup('routing')
    else if (placesState.tone === 'error') setExpandedGroup('places')
    else if (mapsState.tone === 'error') setExpandedGroup('maps')
  }, [expandedGroup, loading, mapsState.tone, placesState.tone, routingState.tone])

  const toggleGroup = (id: ApiServiceId) => setExpandedGroup((current) => current === id ? null : id)
  const saveIntegrations = async () => {
    setError(null); setMessage(null)
    if (googleSelected && !routes.verified) { setError(t('account.preferences.googleCredentialRequired')); return }
    if (preferences.routing.provider === 'openrouteservice' && !ors.verified && !ors.self_hosted) { setError('Ajoutez et vérifiez votre clé OpenRouteService avant d’enregistrer ce moteur.'); return }
    if (preferences.places.provider === 'google' && !places.verified) { setError('Ajoutez et vérifiez votre clé Google Places avant d’enregistrer ce moteur.'); return }
    if (satelliteProvider === 'google' && !satellite.verified) { setError('Ajoutez et vérifiez votre clé Google Map Tiles avant d’enregistrer ce fournisseur.'); return }
    try {
      const next = await updateAccountPreferences(preferences)
      setPreferences(next)
      savedProviderSignature.current = `${next.routing.provider}|${next.places.provider}|${next.basemaps?.satellite_provider ?? (next.preferred_basemap === 'google-satellite' ? 'google' : 'stadia')}`
      onDirtyChange(false)
      window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next }))
      setMessage(t('account.preferences.saved'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('account.loadError')) }
  }

  return <><AccountHeading title={t('account.apiKeys.title')} description={t('account.apiKeys.description')} />
    {error && <div className="form-alert" role="alert">{error}</div>}
    <div className="account-form account-preferences-form account-api-keys">
      <section className="account-api-summary" aria-label="Résumé des services API">
        {serviceStates.map(({ id, title, icon: Icon, state }) => <div key={id} className="account-api-summary__item"><span className="account-api-summary__icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{title}</strong><ApiServiceBadge state={state} /></div></div>)}
        <div className="account-api-summary__item account-api-summary__credentials"><span className="account-api-summary__icon"><KeyRound size={17} aria-hidden="true" /></span><div><strong>{configuredCount} clé{configuredCount > 1 ? 's' : ''} configurée{configuredCount > 1 ? 's' : ''}</strong><span>{verifiedCount} vérifiée{verifiedCount > 1 ? 's' : ''} · {credentialErrorCount} erreur{credentialErrorCount > 1 ? 's' : ''}</span></div></div>
      </section>
      <ApiKeyGroup id="routing" icon={Route} title={t('account.apiKeys.routing')} modifier="routing" providerLabel={routingProviderLabel} state={routingState} expanded={expandedGroup === 'routing'} onToggle={toggleGroup}>
        <ApiProviderCard title={t('account.preferences.engine')} description="Sélectionnez le moteur utilisé pour calculer les itinéraires.">
        <PreferenceField label={t('account.preferences.engine')} htmlFor="account-routing-engine" help={storageAvailable ? t('account.preferences.googlePersonalKeyHelp') : t('account.preferences.googleUnavailable')} className="account-integration-engine">
          <select id="account-routing-engine" aria-labelledby="account-routing-engine-label" value={preferences.routing.provider} onChange={(event) => { setError(null); updateRouting('provider', event.target.value as AccountPreferences['routing']['provider']) }}><option value="osrm">OSRM</option><option value="openrouteservice" disabled={!orsAvailable}>OpenRouteService</option><option value="google" disabled={!storageAvailable}>Google Routes</option></select>
        </PreferenceField>
        {preferences.routing.provider !== 'osrm' && <small>Fallback : OSRM</small>}
        </ApiProviderCard>
        {preferences.routing.provider === 'osrm' && <section className="account-api-no-credential"><KeyRound size={18} aria-hidden="true" /><div><h4>Aucune clé requise</h4><p>OSRM est opérationnel sans credential personnel.</p></div></section>}
        {preferences.routing.provider === 'google' && <GoogleRoutesCredentialPanel status={routes} storageAvailable={storageAvailable} onChanged={(next, reset) => { setRoutes(next); resetRouting(reset) }} />}
        {preferences.routing.provider === 'openrouteservice' && <OpenRouteServiceCredentialPanel status={ors} storageAvailable={storageAvailable} onChanged={(next, reset) => { setOrs(next); resetRouting(reset) }} />}
      </ApiKeyGroup>
      <ApiKeyGroup id="places" icon={MapIcon} title={t('account.apiKeys.places')} modifier="places" providerLabel={placesProviderLabel} state={placesState} expanded={expandedGroup === 'places'} onToggle={toggleGroup}>
        <ApiProviderCard title="Moteur de recherche" description="Sélectionnez le fournisseur utilisé pour rechercher des lieux.">
        <PreferenceField label="Moteur de recherche de lieux" htmlFor="account-places-engine" help="Stadia est utilisé par défaut. Google Places nécessite une clé séparée autorisant Places API (New)." className="account-integration-engine">
          <select id="account-places-engine" aria-labelledby="account-places-engine-label" value={preferences.places.provider} onChange={(event) => { setError(null); setPreferences({ ...preferences, places: { provider: event.target.value as AccountPreferences['places']['provider'] } }) }}><option value="stadia">Stadia</option><option value="google" disabled={!storageAvailable}>Google Places</option></select>
        </PreferenceField>
        </ApiProviderCard>
        {preferences.places.provider === 'stadia' && <StadiaPlacesCredentialPanel status={stadiaPlaces} storageAvailable={storageAvailable} onChanged={setStadiaPlaces} />}
        {preferences.places.provider === 'google' && <GooglePlacesCredentialPanel status={places} storageAvailable={storageAvailable} onChanged={(next, reset) => { setPlaces(next); resetPlaces(reset) }} />}
      </ApiKeyGroup>
      <ApiKeyGroup id="maps" icon={ImageIcon} title={t('account.apiKeys.maps')} modifier="maps" providerLabel={mapsProviderLabel} state={mapsState} expanded={expandedGroup === 'maps'} onToggle={toggleGroup}>
        <ApiProviderCard title="Fournisseur" description="Sélectionnez le fournisseur de tuiles satellite à utiliser.">
        <PreferenceField label="Fournisseur satellite" htmlFor="account-basemap-provider" help="Stadia fonctionne sans clé personnelle. Google Map Tiles exige une clé vérifiée et l’activation de l’administrateur." className="account-integration-engine">
          <select id="account-basemap-provider" aria-labelledby="account-basemap-provider-label" value={satelliteProvider} onChange={(event) => { const provider = event.target.value as 'stadia' | 'google'; setError(null); setPreferences({ ...preferences, basemaps: { satellite_provider: provider }, preferred_basemap: preferences.preferred_basemap === 'satellite' || preferences.preferred_basemap === 'google-satellite' ? (provider === 'google' ? 'google-satellite' : 'satellite') : preferences.preferred_basemap }) }}><option value="stadia">Stadia Maps</option><option value="google">Google Map Tiles</option></select>
        </PreferenceField>
        </ApiProviderCard>
        {satelliteProvider === 'stadia' && <StadiaMapsCredentialPanel status={stadiaMaps} storageAvailable={storageAvailable} onChanged={setStadiaMaps} />}
        {satelliteProvider === 'google' && <>
          <GoogleSatelliteCredentialPanel
            status={satellite}
            storageAvailable={storageAvailable}
            onChanged={(next, reset) => {
              setSatellite(next)
              resetBasemap(reset)
              refreshSatelliteAvailability()
            }}
          />
          {isAdmin && <GoogleSatelliteAdminPanel />}
        </>}
      </ApiKeyGroup>
      {message && <div className="account-success" role="status">{message}</div>}
      <div className="account-preferences-form__actions"><button className="account-button account-button--primary" type="button" onClick={() => void saveIntegrations()}>{t('common.save')}</button></div>
    </div>
  </>
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

function DangerSection({ profile, run, embedded = false }: { profile: AccountProfile; run: (action: () => Promise<void>, success: string) => Promise<boolean>; embedded?: boolean }) {
  const [confirmation, setConfirmation] = useState(''); const [password, setPassword] = useState(''); const [acknowledged, setAcknowledged] = useState(false)
  const ready = profile.can_delete && confirmation === 'SUPPRIMER MON COMPTE' && password.length > 0 && acknowledged
  return <>{!embedded && <AccountHeading title="Zone sensible" description="La suppression désactive et anonymise définitivement votre compte." />}<p className="account-card-description">La suppression désactive et anonymise définitivement votre compte.</p><div className="account-danger-summary"><p>{profile.owned_maps.length} carte(s) possédée(s), {profile.shared_map_count} carte(s) partagée(s).</p>{profile.owned_maps.length > 0 && <><strong>Transférez ou supprimez d’abord :</strong><ul>{profile.owned_maps.map((map) => <li key={map.id}>{map.name}</li>)}</ul></>}</div><form className="account-form danger account-security-dialog__form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await deleteOwnAccount(password, confirmation, acknowledged); window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)) }, 'Compte supprimé.') }}><label>Mot de passe actuel<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Recopiez SUPPRIMER MON COMPTE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="SUPPRIMER MON COMPTE" required /></label><label className="checkbox-field"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Je comprends que cette action est définitive.</label><button className="account-button account-button--danger" type="submit" disabled={!ready}>Supprimer mon compte</button></form></>
}

function AccountHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">Compte</p><h2>{title}</h2><span>{description}</span></header> }
function formatDate(value: string, withTime = false): string { return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(value)) }
function messageFor(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback }
