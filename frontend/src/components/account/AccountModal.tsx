import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Copy, Eye, EyeOff, Globe2, HardDriveDownload, Image as ImageIcon, Info, KeyRound, LayoutDashboard, Link, List, LockKeyhole, Mail, Map as MapIcon, Monitor, MonitorSmartphone, Moon, Save, Settings2, Shield, ShieldCheck, ShieldCog, Sparkles, Sun, Trash2, Upload, UserRound, X, type LucideIcon } from 'lucide-react'

import { ACCOUNT_PREFERENCES_UPDATED_EVENT, accountAvatarUrl, changeAccountEmail, changeAccountPassword, confirmEmailMfaSetup, confirmTotpSetup, deleteAccountAvatar, deleteOwnAccount, disableEmailMfa, disableTotp, getAccountPreferences, getAccountProfile, getAccountSessions, getEmailMfaStatus, getTotpStatus, regenerateTotpRecoveryCodes, revokeAccountSession, revokeOtherAccountSessions, startEmailMfaSetup, startTotpSetup, updateAccountPreferences, updateAccountProfile, uploadAccountAvatar } from '../../api/account'
import { SESSION_EXPIRED_EVENT } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { notifyNotificationsChanged } from '../notifications/events'
import { useI18n } from '../../i18n/useI18n'
import { applyDisplayDensity, saveDisplayDensity } from '../../theme/displayDensity'
import { saveThemePreference } from '../../theme/theme'
import type { AccountPreferences, AccountProfile, AccountSession, TotpRecoveryCodes, TotpSecurityStatus, TotpSetup } from '../../types/account'
import { FieldHelp } from '../common/FieldHelp'
import { UnsavedChangesDialog } from '../common/UnsavedChangesDialog'
import { OfflineDataSection } from './OfflineDataSection'
import { PersonalApiKeysSection } from './PersonalApiKeysSection'
import { IntegrationPreferences } from './IntegrationPreferences'
import { PrivacySection } from './PrivacySection'
import { AvatarCropDialog } from './AvatarCropDialog'

type Section = 'profile' | 'security' | 'preferences' | 'api_keys' | 'privacy' | 'offline'

const emptyPreferences: AccountPreferences = { language: 'fr', default_theme: 'system', preferred_basemap: 'osm', density: 'compact', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, photo_markers_enabled: false, onboarding: { dismissed: false, completed_steps: [] }, routing: { provider: 'osrm' }, places: { provider: 'stadia' }, basemaps: { classic_provider: 'osm', satellite_provider: 'none' } }

const fallbackTimeZones = ['Europe/Paris', 'Europe/London', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid', 'Europe/Zurich', 'America/New_York', 'America/Los_Angeles', 'America/Toronto', 'Asia/Tbilisi', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland', 'UTC']
const supportedTimeZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : fallbackTimeZones

export function AccountModal({ onClose, trigger }: { onClose: () => void; onOpenAdmin?: () => void; trigger: HTMLElement | null }) {
  const { user, refresh } = useAuth()
  const { t, setLocale } = useI18n()
  const translationRef = useRef(t)
  const [section, setSection] = useState<Section>('profile')
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [sessions, setSessions] = useState<AccountSession[]>([])
  const [preferences, setPreferences] = useState<AccountPreferences>(emptyPreferences)
  const [savedPreferences, setSavedPreferences] = useState<AccountPreferences>(emptyPreferences)
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const modal = useRef<HTMLElement>(null)
  const profileDirty = profile !== null && draftName.trim() !== profile.display_name
  const preferencesDirty = JSON.stringify(preferences) !== JSON.stringify(savedPreferences)
  const dirty = profileDirty || preferencesDirty
  const dirtyRef = useRef(false)
  const closeRef = useRef(onClose)
  dirtyRef.current = dirty
  closeRef.current = onClose
  translationRef.current = t
  const avatar = accountAvatarUrl(profile?.avatar_url ?? user?.avatar_url ?? null)
  const initials = (profile?.display_name ?? user?.display_name ?? '?').trim().charAt(0).toUpperCase()

  const load = async () => {
    const [nextProfile, nextSessions, nextPreferences] = await Promise.all([
      getAccountProfile(),
      getAccountSessions(),
      getAccountPreferences(),
    ])
    setProfile(nextProfile); setDraftName(nextProfile.display_name); setSessions(nextSessions); setPreferences(nextPreferences); setSavedPreferences(nextPreferences)
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
        if (document.querySelector('.account-security-dialog[aria-modal="true"], .account-avatar-crop-dialog[aria-modal="true"]')) return
        event.preventDefault()
        if (!dirtyRef.current) closeRef.current()
        else setConfirmClose(true)
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

  const requestClose = () => { if (!dirty) onClose(); else setConfirmClose(true) }
  useEffect(() => {
    const closeFromMobileNavigation = () => requestClose()
    window.addEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
    return () => window.removeEventListener('cartavault:close-mobile-modal-layers', closeFromMobileNavigation)
  }, [requestClose])
  const selectSection = (next: Section) => {
    if (next === section) return
    setSection(next)
  }
  const run = async (action: () => Promise<void>, success: string, failure = t('account.operationError')): Promise<boolean> => {
    setError(null); setMessage(null)
    try { await action(); setMessage(success); return true } catch (reason) { setError(messageFor(reason, failure)); return false }
  }
  const saveChanges = async () => {
    if (!dirty) return
    const successMessage = profileDirty && preferencesDirty
      ? t('account.feedback.profilePreferencesSaved')
      : profileDirty
        ? t('account.feedback.profileSaved')
        : t('account.feedback.preferencesSaved')
    setSaving(true)
    const ok = await run(async () => {
      if (profileDirty) await updateAccountProfile(draftName.trim())
      if (preferencesDirty) {
        const next = await updateAccountPreferences(preferences)
        saveThemePreference(next.default_theme, window.localStorage, user?.id)
        setLocale(next.language)
        applyDisplayDensity(next.density)
        saveDisplayDensity(next.density, window.localStorage)
        window.dispatchEvent(new CustomEvent<AccountPreferences>(ACCOUNT_PREFERENCES_UPDATED_EVENT, { detail: next }))
      }
      await refresh()
      await load()
    }, successMessage, profileDirty && preferencesDirty
      ? t('account.feedback.profilePreferencesFailed')
      : profileDirty
        ? t('account.feedback.profileFailed')
        : t('account.feedback.preferencesFailed'))
    setSaving(false)
    return ok
  }
  const chooseAvatar = (file: File) => {
    setError(null); setMessage(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(t('account.avatarInvalid')); return }
    setAvatarFile(file)
  }
  const uploadAvatar = async (file: File): Promise<boolean> => {
    return run(async () => { await uploadAccountAvatar(file); await refresh(); await load() }, t('account.avatarUpdated'))
  }

  return createPortal(
    <div className="account-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <section ref={modal} className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="account-modal__header">
          <div className="account-avatar">{avatar ? <img src={avatar} alt={`Avatar de ${profile?.display_name ?? user?.display_name}`} /> : initials}</div>
          <div><h2 id="account-title">{t('account.title')}</h2><p>{profile?.email ?? user?.email}</p>{user?.is_admin && <span><Shield size={13} />{t('account.admin')}</span>}</div>
          <div className="account-modal__header-actions"><button className="account-button account-button--primary account-modal__save" type="button" disabled={!dirty || saving} onClick={() => void saveChanges()}><Save size={14} />{saving ? t('account.feedback.saving') : t('account.feedback.save')}</button><button ref={closeButton} className="panel-icon-button modal-header-close" type="button" aria-label={t('account.close')} onClick={requestClose}><X size={14} /></button></div>
        </header>
        <nav className="account-modal__nav" aria-label={t('account.navigation')}>
          {([[ 'profile', UserRound, t('account.profile') ], [ 'security', ShieldCog, t('account.security') ], [ 'preferences', Settings2, t('account.preferences') ], [ 'api_keys', KeyRound, t('account.apiKeys') ], [ 'privacy', ShieldCheck, t('account.privacy') ], [ 'offline', HardDriveDownload, t('account.offline') ]] as const).map(([id, Icon, label]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => selectSection(id)}><Icon size={17} />{label}</button>)}
        </nav>
        <main className="account-modal__content">
          {error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="account-success" role="status">{message}</div>}
          {section === 'profile' && profile && <ProfileSection profile={profile} preferences={preferences} setPreferences={setPreferences} avatar={avatar} initials={initials} draftName={draftName} setDraftName={setDraftName} chooseAvatar={chooseAvatar} removeAvatar={() => run(async () => { await deleteAccountAvatar(); await refresh(); await load() }, 'Avatar supprimé.')} />}
          {section === 'security' && profile && <SecuritySection profile={profile} sessions={sessions} run={run} refreshProfile={async () => { await refresh(); await load() }} reload={load} />}
          {section === 'preferences' && <PreferencesSection preferences={preferences} setPreferences={setPreferences} />}
          {section === 'api_keys' && <PersonalApiKeysSection />}
          {section === 'privacy' && <PrivacySection />}
          {section === 'offline' && <OfflineDataSection />}
        </main>
      </section>
      {avatarFile && <AvatarCropDialog file={avatarFile} onCancel={() => setAvatarFile(null)} onConfirm={uploadAvatar} />}
      {confirmClose && <UnsavedChangesDialog saving={saving} onCancel={() => setConfirmClose(false)} onDiscard={onClose} onSave={() => { void saveChanges().then((ok) => { if (ok) onClose() }) }} />}
    </div>, document.body,
  )
}

function ProfileSection({ profile, preferences, setPreferences, avatar, initials, draftName, setDraftName, chooseAvatar, removeAvatar }: { profile: AccountProfile; preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void; avatar: string | null; initials: string; draftName: string; setDraftName: (name: string) => void; chooseAvatar: (file: File) => void; removeAvatar: () => Promise<boolean> }) {
  const { t, locale } = useI18n()
  return <><AccountHeading title={t('account.profile')} description={t('account.profileSection.description')} />
    <section className="account-preference-card account-profile-identity-card">
      <div className="account-profile-identity-card__body">
        <div className="account-profile-avatar"><div className="account-avatar large">{avatar ? <img src={avatar} alt={t('account.profileSection.avatarPreview')} /> : initials}</div><small>{t('account.profileSection.imageFormats')}</small></div>
        <form className="account-profile-field" onSubmit={(event) => event.preventDefault()}><label htmlFor="account-display-name">{t('account.profileSection.displayName')}</label><span><input id="account-display-name" name="display_name" value={draftName} placeholder={t('account.profileSection.displayNamePlaceholder')} required maxLength={120} onChange={(event) => setDraftName(event.target.value)} /><UserRound size={17} aria-hidden="true" /></span><p>{t('account.profileSection.avatarDescription')}</p><div className="account-avatar-editor__actions"><label className="account-button account-button--secondary"><Upload size={15} />{t('account.profileSection.importImage')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseAvatar(file); event.currentTarget.value = '' }} /></label>{avatar && <button className="account-button account-button--danger-quiet" type="button" onClick={() => void removeAvatar()}><Trash2 size={15} />{t('account.profileSection.delete')}</button>}</div></form>
      </div>
    </section>
    <section className="account-profile-metadata-card">
      <h3>{t('account.profileSection.accountInformation')}</h3>
      <dl className="account-metadata">
        <div><dt><Mail size={16} aria-hidden="true" /></dt><dd><strong>{t('account.profileSection.email')}</strong><span>{profile.email}</span></dd></div>
        <div><dt><CalendarDays size={16} aria-hidden="true" /></dt><dd><strong>{t('account.profileSection.created')}</strong><span>{new Date(profile.created_at).toLocaleDateString(locale)}</span></dd></div>
        <div><dt><Clock3 size={16} aria-hidden="true" /></dt><dd><strong>{t('account.profileSection.lastLogin')}</strong><span>{profile.last_login_at ? new Date(profile.last_login_at).toLocaleString(locale) : t('account.profileSection.unavailable')}</span></dd></div>
        <div><dt><MapIcon size={16} aria-hidden="true" /></dt><dd><strong>{t('account.profileSection.ownedMaps')}</strong><span>{profile.owned_maps.length}</span></dd></div>
      </dl>
    </section>
    <section className="account-preference-card account-onboarding-guide">
      <PreferenceCardHeading icon={Sparkles} title="Guide de démarrage" />
      <div className="account-onboarding-guide__option"><div><strong>Afficher le guide de démarrage</strong><p>Affiche les étapes de prise en main sur votre tableau de bord.</p></div><label className="cv-toggle"><input id="account-onboarding-guide" type="checkbox" role="switch" aria-label="Afficher le guide de démarrage" checked={!preferences.onboarding.dismissed} onChange={(event) => setPreferences({ ...preferences, onboarding: { ...preferences.onboarding, dismissed: !event.target.checked } })} /><i aria-hidden="true" /><span>{preferences.onboarding.dismissed ? 'Masqué' : 'Affiché'}</span></label></div>
    </section>
  </>
}

type EmailMfaStatus = { enabled: boolean; verified_at: string | null; available: boolean }
type SecurityDialogKind = 'email' | 'password' | 'totp' | 'email-mfa' | 'recovery' | 'sessions' | 'delete'

function SecuritySection({ profile, sessions, run, refreshProfile, reload }: { profile: AccountProfile; sessions: AccountSession[]; run: (action: () => Promise<void>, success: string) => Promise<boolean>; refreshProfile: () => Promise<void>; reload: () => Promise<void> }) {
  const { t } = useI18n()
  const [dialog, setDialog] = useState<SecurityDialogKind | null>(null)
  const [totpStatus, setTotpStatus] = useState<TotpSecurityStatus | null>(null)
  const [emailMfaStatus, setEmailMfaStatus] = useState<EmailMfaStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [showSecurityAdvice, setShowSecurityAdvice] = useState(true)
  useEffect(() => {
    let active = true
    void Promise.all([getTotpStatus(), getEmailMfaStatus()])
      .then(([totp, email]) => { if (active) { setTotpStatus(totp); setEmailMfaStatus(email); setStatusError(null) } })
      .catch(() => { if (active) setStatusError(t('account.securitySection.loadError')) })
    return () => { active = false }
  }, [])
  const mfaEnabled = Boolean(totpStatus?.enabled || emailMfaStatus?.enabled)
  const closeDialog = () => setDialog(null)
  return <section className="account-security-dashboard">
    <AccountHeading title={t('account.security')} description={t('account.securitySection.description')} />
    <section className="account-security-summary" aria-label={t('account.securitySection.summary')}>
      <div className="account-api-summary account-security-summary__grid">
        <SecuritySummaryItem icon={ShieldCheck} label={t('account.securitySection.account')} value={profile.is_active ? t('account.securitySection.active') : t('account.securitySection.inactive')} tone={profile.is_active ? 'success' : 'danger'} />
        <SecuritySummaryItem icon={Mail} label={t('account.securitySection.email')} value={profile.email_verified ? t('account.securitySection.verified') : t('account.securitySection.toVerify')} tone={profile.email_verified ? 'success' : 'warning'} />
        <SecuritySummaryItem icon={MonitorSmartphone} label="Sessions" value={`${profile.active_session_count} active${profile.active_session_count > 1 ? 's' : ''}`} tone="success" />
        <SecuritySummaryItem icon={LockKeyhole} label="MFA" value={totpStatus?.enabled ? 'Renforcée' : emailMfaStatus?.enabled ? 'Activé' : 'Désactivé'} tone={totpStatus?.enabled || emailMfaStatus?.enabled ? 'success' : 'warning'} />
      </div>
      {statusError && <p className="form-alert" role="alert">{statusError}</p>}
    </section>

    <div className="account-security-main-grid">
    <section className="account-security-mfa-card" aria-labelledby="security-mfa-title">
      <header><span><LockKeyhole size={20} /></span><div><h2 id="security-mfa-title">Authentification à deux facteurs</h2><p>Ajoutez une couche de sécurité supplémentaire à votre compte.</p></div></header>
      <div className="account-security-action-list">
        <SecurityActionRow icon={LockKeyhole} title={t('account.securitySection.authenticatorApp')} description={totpStatus?.enabled ? t('account.securitySection.authenticatorHelp') : emailMfaStatus?.enabled ? 'Configurez cette méthode pour remplacer le code par e-mail.' : t('account.securitySection.authenticatorHelp')} status={totpStatus?.enabled ? t('account.securitySection.configured') : 'Recommandé'} tone={totpStatus?.enabled ? 'success' : 'info'} action={totpStatus?.enabled ? t('account.securitySection.manage') : 'Configurer'} configured={Boolean(totpStatus?.enabled)} onClick={() => setDialog('totp')} />
        {totpStatus?.enabled && <SecurityActionRow icon={ShieldCheck} title={t('account.securitySection.recoveryCodes')} description={t('account.securitySection.recoveryHelp')} status={t('account.securitySection.remaining', { count: totpStatus.recovery_codes_remaining })} tone="success" action={t('account.securitySection.regenerate')} onClick={() => setDialog('recovery')} />}
        {!totpStatus?.enabled && <SecurityActionRow icon={Mail} title={t('account.securitySection.emailCode')} description={t('account.securitySection.emailCodeHelp')} status={emailMfaStatus?.enabled ? t('account.securitySection.enabled') : undefined} tone={emailMfaStatus?.enabled ? 'success' : 'muted'} action={emailMfaStatus?.enabled ? t('account.securitySection.manage') : t('account.securitySection.activate')} configured={Boolean(emailMfaStatus?.enabled)} disabled={!emailMfaStatus?.available} disabledTitle={!emailMfaStatus?.available ? t('account.securitySection.configureEmailService') : undefined} onClick={() => setDialog('email-mfa')} />}
      </div>
      <p className="account-security-mfa-note"><Info size={15} />{totpStatus?.enabled ? 'Une méthode d’authentification à deux facteurs est active sur votre compte.' : emailMfaStatus?.enabled ? 'Pour une protection renforcée, privilégiez une application d’authentification (TOTP).' : 'Une fois la MFA activée, vous devrez l’utiliser à chaque connexion.'}</p>
    </section>
    <div className="account-security-side">
      <SecurityActionCard icon={Mail} title={t('account.securitySection.emailAddress')} description={t('account.securitySection.currentEmail')} detail={profile.email} action="Modifier" onClick={() => setDialog('email')} />
      <SecurityActionCard icon={LockKeyhole} title={t('account.securitySection.password')} description={t('account.securitySection.passwordHelp')} action="Modifier" onClick={() => setDialog('password')} />
    <section className="account-security-sessions-card">
      <header><span><MonitorSmartphone size={20} /></span><div><h3>{t('account.securitySection.sessionsDevices')}</h3><p>{t('account.securitySection.sessionsHelp')}</p></div><button className="account-button account-button--secondary" type="button" onClick={() => setDialog('sessions')}>{t('account.securitySection.manageSessions')}</button></header>
      <ul className={sessions.length > 3 ? 'is-scrollable' : undefined}>{sessions.map((item) => { const details = describeSession(item); const DeviceIcon = details.mobile ? MonitorSmartphone : Monitor; return <li key={item.id}><DeviceIcon size={17} /><div><strong>{details.device}</strong><span>{details.location} · {details.browser} · {details.activity}</span></div>{item.is_current && <b>Actuel</b>}</li> })}{sessions.length === 0 && <li className="is-empty">Aucune session active.</li>}</ul>
    </section>
    </div>
    </div>
    {!mfaEnabled && showSecurityAdvice && <aside className="account-security-advice"><span><ShieldCheck size={22} /></span><div><h3>Conseil sécurité</h3><p>Utilisez un mot de passe unique et activez la MFA pour réduire considérablement les risques d’accès non autorisés.</p></div><button type="button" aria-label="Masquer le conseil sécurité" onClick={() => setShowSecurityAdvice(false)}><X size={16} /></button></aside>}
    <section className="account-security-danger">
      <span className="account-security-section-title__icon"><AlertTriangle size={19} /></span><div><h3>{t('account.securitySection.sensitiveZone')}</h3><p>{t('account.securitySection.sensitiveHelp')}</p></div><button className="account-button account-button--danger" type="button" onClick={() => setDialog('delete')}>{t('account.securitySection.deleteAccount')}</button>
    </section>

    {dialog === 'email' && <AccountSecurityDialog icon={Mail} title={t('account.securitySection.changeEmail')} description="Mettez à jour l’adresse e-mail associée à votre compte." variant="email-change" onClose={closeDialog}><EmailChangePanel run={run} refreshProfile={refreshProfile} onComplete={closeDialog} /></AccountSecurityDialog>}
    {dialog === 'password' && <AccountSecurityDialog icon={LockKeyhole} title={t('account.securitySection.changePassword')} description="Choisissez un mot de passe fort et unique pour sécuriser votre compte." variant="password-change" onClose={closeDialog}><PasswordChangePanel run={run} onComplete={closeDialog} /></AccountSecurityDialog>}
    {dialog === 'totp' && totpStatus && <AccountSecurityDialog icon={LockKeyhole} title={t('account.securitySection.authenticatorApp')} description={totpStatus.enabled ? undefined : 'Scannez le QR Code ou ajoutez la clé dans votre application, puis saisissez le code généré.'} variant={totpStatus.enabled ? undefined : 'totp-setup'} onClose={closeDialog}><TotpSection status={totpStatus} run={run} onStatusChange={setTotpStatus} onActivated={() => setEmailMfaStatus((current) => current ? { ...current, enabled: false, verified_at: null } : current)} onCancel={closeDialog} /></AccountSecurityDialog>}
    {dialog === 'email-mfa' && emailMfaStatus && <AccountSecurityDialog icon={Mail} title={t('account.securitySection.emailCode')} description="Recevez un code de sécurité à chaque connexion." variant="email-mfa" onClose={closeDialog}><EmailMfaSection status={emailMfaStatus} email={profile.email} run={run} onStatusChange={setEmailMfaStatus} onChangeEmail={() => setDialog('email')} /></AccountSecurityDialog>}
    {dialog === 'recovery' && totpStatus?.enabled && <AccountSecurityDialog icon={ShieldCheck} title={t('account.securitySection.regenerateRecovery')} onClose={closeDialog}><RecoveryCodesPanel status={totpStatus} onStatusChange={setTotpStatus} /></AccountSecurityDialog>}
    {dialog === 'sessions' && <AccountSecurityDialog icon={MonitorSmartphone} title={t('account.securitySection.sessionsDevices')} description="Contrôlez les appareils actuellement connectés à votre compte." onClose={closeDialog} wide><SessionsSection sessions={sessions} run={run} reload={reload} embedded /></AccountSecurityDialog>}
    {dialog === 'delete' && <AccountSecurityDialog icon={AlertTriangle} title={t('account.securitySection.deleteAccount')} onClose={closeDialog}><DangerSection profile={profile} run={run} embedded /></AccountSecurityDialog>}
  </section>
}

function SecuritySummaryItem({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'success' | 'warning' | 'danger' }) {
  const apiTone: ApiServiceTone = tone === 'success' ? 'success' : tone === 'danger' ? 'error' : 'warning'
  return <article className={`account-api-summary__item is-${tone}`}><span className="account-api-summary__icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{label}</strong><ApiServiceBadge state={{ label: value, tone: apiTone, date: null }} /></div></article>
}

function SecurityActionCard({ icon: Icon, title, description, detail, action, onClick }: { icon: LucideIcon; title: string; description: string; detail?: string; action: string; onClick: () => void }) {
  return <article><div className="account-security-action-card__body"><Icon size={20} /><div><h3>{title}</h3><p>{description}</p>{detail && <strong>{detail}</strong>}</div></div><button className="account-security-action-card__button" type="button" onClick={onClick}>{action}</button></article>
}

function SecurityActionRow({ icon: Icon, title, description, status, tone, action, configured = false, disabled = false, disabledTitle, onClick }: { icon: LucideIcon; title: string; description: string; status?: string; tone: 'success' | 'warning' | 'info' | 'muted'; action: string; configured?: boolean; disabled?: boolean; disabledTitle?: string; onClick: () => void }) {
  const apiTone: ApiServiceTone = tone === 'muted' ? 'neutral' : tone
  return <article className={configured ? 'is-configured' : undefined} title={disabledTitle}><span className="account-security-action-row__icon"><Icon size={18} /></span><div><h3>{title}</h3><p>{description}</p></div>{status && <ApiServiceBadge state={{ label: status, tone: apiTone, date: null }} />}<button className="account-button account-button--secondary" type="button" disabled={disabled} onClick={onClick}>{action}</button></article>
}

function AccountSecurityDialog({ icon: Icon, title, description, variant, onClose, wide = false, children }: { icon: LucideIcon; title: string; description?: string; variant?: 'email-change' | 'password-change' | 'totp-setup' | 'email-mfa'; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const { t, locale } = useI18n()
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const titleId = `account-security-dialog-${title.toLocaleLowerCase(locale).replace(/[^a-z0-9]+/g, '-')}`
  return createPortal(<div className="account-security-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`account-security-dialog${wide ? ' account-security-dialog--wide' : ''}${variant ? ` account-security-dialog--${variant}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><span><Icon size={19} /></span><div><p>{t('account.securitySection.dialogEyebrow')}</p><h2 id={titleId}>{title}</h2>{description && <small>{description}</small>}</div><button ref={closeButton} className="panel-icon-button" type="button" aria-label={t('account.securitySection.close')} onClick={onClose}><X size={16} /></button></header><div className="account-security-dialog__content">{children}</div></section></div>, document.body)
}

function EmailChangePanel({ run, refreshProfile, onComplete }: { run: (action: () => Promise<void>, success: string) => Promise<boolean>; refreshProfile: () => Promise<void>; onComplete: () => void }) {
  const { t } = useI18n()
  const [passwordVisible, setPasswordVisible] = useState(false)
  return <form className="account-form account-security-dialog__form account-email-change-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await changeAccountEmail(String(data.get('current_password')), String(data.get('new_email'))); await refreshProfile() }, t('account.securitySection.emailUpdated')).then((ok) => { if (ok) { form.reset(); onComplete() } }) }}>
    <div className="account-email-change-form__body">
      <label>{t('account.securitySection.newEmail')}<span className="account-email-change-form__control"><Mail size={18} /><input name="new_email" type="email" placeholder="exemple@domaine.com" required autoComplete="email" /></span></label>
      <label>{t('account.securitySection.currentPassword')}<span className="account-email-change-form__control"><LockKeyhole size={18} /><input name="current_password" type={passwordVisible ? 'text' : 'password'} placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" /><button type="button" aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      <aside className="account-email-change-form__notice"><Info size={19} /><p>Pour des raisons de sécurité, nous vérifierons votre mot de passe avant de modifier votre adresse e-mail.</p></aside>
    </div>
    <div className="dialog-actions"><button className="account-button account-button--secondary" type="button" onClick={onComplete}>Annuler</button><button className="account-button account-button--primary" type="submit">Modifier l’e-mail</button></div>
  </form>
}

function PasswordChangePanel({ run, onComplete }: { run: (action: () => Promise<void>, success: string) => Promise<boolean>; onComplete: () => void }) {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visibleFields, setVisibleFields] = useState<Record<'current' | 'new' | 'confirmation', boolean>>({ current: false, new: false, confirmation: false })
  const rules = [
    { label: 'Au moins 12 caractères', valid: newPassword.length >= 12 },
    { label: '1 majuscule et 1 minuscule', valid: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: '1 chiffre', valid: /\d/.test(newPassword) },
    { label: '1 caractère spécial', valid: /[^A-Za-z0-9]/.test(newPassword) },
  ]
  const strength = rules.filter((rule) => rule.valid).length
  const strengthLabel = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Fort'][strength]
  const confirmationMatches = Boolean(confirmation) && confirmation === newPassword
  const canSubmit = Boolean(currentPassword) && strength === rules.length && confirmationMatches && currentPassword !== newPassword
  const toggleVisibility = (field: 'current' | 'new' | 'confirmation') => setVisibleFields((current) => ({ ...current, [field]: !current[field] }))
  const visibilityButton = (field: 'current' | 'new' | 'confirmation') => <button type="button" aria-label={visibleFields[field] ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => toggleVisibility(field)}>{visibleFields[field] ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  return <form className="account-form account-security-dialog__form account-password-change-form" onSubmit={(event) => { event.preventDefault(); if (!canSubmit) return; void run(() => changeAccountPassword(currentPassword, newPassword, confirmation), t('account.securitySection.passwordUpdated')).then((ok) => { if (ok) onComplete() }) }}>
    <div className="account-password-change-form__body">
      <label>{t('account.securitySection.currentPassword')}<span className="account-email-change-form__control"><LockKeyhole size={18} /><input name="current_password" type={visibleFields.current ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" />{visibilityButton('current')}</span></label>
      <label>{t('account.securitySection.newPassword')}<span className="account-email-change-form__control"><LockKeyhole size={18} /><input name="new_password" type={visibleFields.new ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Minimum 12 caractères" minLength={12} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}" required autoComplete="new-password" />{visibilityButton('new')}</span></label>
      <section className="account-password-strength" aria-label="Robustesse du mot de passe"><header><strong>Robustesse du mot de passe</strong><b>{strengthLabel}</b></header><div className="account-password-strength__bars" aria-hidden="true">{rules.map((rule, index) => <i className={index < strength ? 'is-active' : undefined} key={rule.label} />)}</div><ul>{rules.map((rule) => <li className={rule.valid ? 'is-valid' : undefined} key={rule.label}>{rule.valid ? <CheckCircle2 size={16} /> : <span>–</span>}{rule.label}</li>)}</ul></section>
      <label>{t('account.securitySection.confirmation')}<span className="account-email-change-form__control account-password-confirmation-control"><LockKeyhole size={18} /><input name="confirmation" type={visibleFields.confirmation ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirmez votre nouveau mot de passe" minLength={12} required autoComplete="new-password" /><span className="account-password-confirmation-control__actions">{visibilityButton('confirmation')}{confirmationMatches && <CheckCircle2 size={18} aria-label="Les mots de passe correspondent" />}</span></span></label>
      <aside className="account-email-change-form__notice"><Info size={19} /><p>Pour votre sécurité, le nouveau mot de passe doit être différent de l’ancien et suffisamment robuste.</p></aside>
    </div>
    <div className="dialog-actions"><button className="account-button account-button--secondary" type="button" onClick={onComplete}>Annuler</button><button className="account-button account-button--primary" type="submit" disabled={!canSubmit}>Modifier le mot de passe</button></div>
  </form>
}

function EmailMfaSection({ status, email, run, onStatusChange, onChangeEmail }: { status: EmailMfaStatus; email: string; run: (action: () => Promise<void>, success: string) => Promise<boolean>; onStatusChange: (status: EmailMfaStatus) => void; onChangeEmail: () => void }) {
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!status.available) return <section className="account-email-mfa"><div className="account-email-mfa__body"><aside className="account-email-mfa__notice"><Info size={19} /><div><strong>Service indisponible</strong><p>Configurez Resend ou SMTP pour activer le code par e-mail.</p></div></aside></div></section>
  if (status.enabled) return <section className="account-email-mfa"><div className="account-email-mfa__body"><aside className="account-email-mfa__notice"><Info size={19} /><div><strong>Code par e-mail activé</strong><p>Cette méthode est active{status.verified_at ? ` depuis le ${formatDate(status.verified_at)}` : ''}.</p></div></aside><label>Mot de passe actuel *<span className="account-email-change-form__control"><LockKeyhole size={18} /><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" /><button type="button" aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>{error && <p className="form-alert" role="alert">{error}</p>}</div><div className="dialog-actions"><button className="account-button account-button--danger-hover" type="button" disabled={!password} onClick={() => void run(() => disableEmailMfa(password), 'Authentification e-mail désactivée.').then((ok) => { if (ok) { onStatusChange({ ...status, enabled: false, verified_at: null }); notifyNotificationsChanged() } })}>Désactiver</button></div></section>
  if (challenge) return <section className="account-email-mfa"><div className="account-email-mfa__body"><aside className="account-email-mfa__notice"><Info size={19} /><div><strong>Code envoyé</strong><p>Le code envoyé à {email} reste valable 10 minutes.</p></div></aside><div className="totp-setup__code"><strong>Code reçu par e-mail *</strong><TotpCodeInput value={code} onChange={setCode} /></div>{error && <p className="form-alert" role="alert">{error}</p>}</div><div className="dialog-actions"><button className="account-button account-button--primary account-email-mfa__primary" type="button" disabled={code.length !== 6} onClick={() => void confirmEmailMfaSetup(challenge, code).then(() => { const next = { ...status, enabled: true, verified_at: new Date().toISOString() }; onStatusChange(next); setChallenge(''); notifyNotificationsChanged() }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Code invalide.'))}>Vérifier et activer</button></div></section>
  return <section className="account-email-mfa"><div className="account-email-mfa__body"><aside className="account-email-mfa__notice"><Info size={19} /><div><strong>À savoir</strong><p>Le code est envoyé à votre adresse e-mail et reste valable 10 minutes.</p></div></aside><label>Mot de passe actuel *<span className="account-email-change-form__control"><LockKeyhole size={18} /><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Saisissez votre mot de passe actuel" required autoComplete="current-password" /><button type="button" aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label><article className="account-email-mfa__delivery"><span><Mail size={20} /></span><div><strong>Envoi du code</strong><p>Nous vous enverrons un code de sécurité à votre adresse e-mail.</p><b>{email}</b></div><button className="account-button account-button--secondary" type="button" onClick={onChangeEmail}>Modifier l’e-mail</button></article>{error && <p className="form-alert" role="alert">{error}</p>}<button className="account-button account-button--primary account-email-mfa__primary" type="button" disabled={!password} onClick={() => void startEmailMfaSetup(password).then((value) => { setChallenge(value.challenge_token); setError(null) }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Activation impossible.'))}>Envoyer un code</button><p className="account-email-mfa__footnote"><ShieldCheck size={15} />Si vous ne recevez pas le code, vérifiez vos spams ou demandez un nouvel envoi.</p></div></section>
}

function TotpSection({ status, run, onStatusChange, onActivated, onCancel }: { status: TotpSecurityStatus; run: (action: () => Promise<void>, success: string) => Promise<boolean>; onStatusChange: (status: TotpSecurityStatus) => void; onActivated: () => void; onCancel: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [setupLoading, setSetupLoading] = useState(!status.enabled)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<TotpRecoveryCodes | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Copiez la valeur affichée manuellement.') } }
  const setupErrorMessage = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message.trim() : ''
    return message || 'Impossible de démarrer la configuration TOTP.'
  }
  const loadSetup = () => {
    setSetupLoading(true)
    setError(null)
    void startTotpSetup()
      .then(setSetup)
      .catch((reason) => setError(setupErrorMessage(reason)))
      .finally(() => setSetupLoading(false))
  }
  useEffect(() => {
    if (!status.enabled) loadSetup()
    // The setup is intentionally started once when the dedicated dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <section className="account-security-dialog__form">
    {!status.enabled && !setup && setupLoading && <p className="account-card-description" role="status">Préparation de la configuration TOTP…</p>}
    {!status.enabled && !setup && !setupLoading && error && <><p className="form-alert" role="alert">{error}</p><button className="account-button account-button--secondary" type="button" onClick={loadSetup}>Réessayer</button></>}
    {setup && !recovery && <div className="account-totp-activation"><div className="account-totp-activation__body"><div className="account-totp-activation__setup"><img className="totp-qr-code" src={setup.qr_code_data_url} alt="Code QR de configuration CartaVault" /><div className="totp-setup__key"><strong>Clé de configuration</strong><code>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code><div><button className="account-button account-button--secondary" type="button" onClick={() => void copy(setup.secret)}><Copy size={15} />Copier</button><a className="account-button account-button--secondary" href={setup.provisioning_uri}><Link size={15} />Ouvrir</a></div></div></div><div className="totp-setup__code"><strong>Code à 6 chiffres *</strong><TotpCodeInput value={code} onChange={setCode} /></div><aside className="account-email-change-form__notice"><Info size={19} /><p>Pour finaliser l’activation, saisissez le code temporaire généré par votre application d’authentification.</p></aside>{error && <p className="form-alert" role="alert">{error}</p>}</div><div className="dialog-actions"><button className="account-button account-button--secondary" type="button" onClick={onCancel}>Annuler</button><button className="account-button account-button--primary" type="button" disabled={code.length !== 6} onClick={() => void confirmTotpSetup(code).then((value) => { setRecovery(value); setSetup(null); onStatusChange({ ...status, enabled: true, verified_at: new Date().toISOString(), recovery_codes_remaining: value.recovery_codes.length }); onActivated(); notifyNotificationsChanged() }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Code invalide.'))}>Vérifier et activer</button></div></div>}
    {recovery && <><p className="form-alert">Enregistrez ces codes maintenant. Ils ne seront plus affichés.</p><pre className="totp-recovery-codes">{recovery.recovery_codes.join('\n')}</pre><button className="account-button account-button--secondary" type="button" onClick={() => void copy(recovery.recovery_codes.join('\n'))}>Copier tous les codes</button></>}
    {status.enabled && !recovery && <><p className="account-card-description">Activée{status.verified_at ? ` le ${formatDate(status.verified_at)}` : ''}. {status.recovery_codes_remaining} code(s) de récupération restant(s).</p><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Code d’authentification *<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label>{error && <p className="form-alert" role="alert">{error}</p>}<button className="account-button account-button--danger-hover" type="button" disabled={!password || !code} onClick={() => void run(() => disableTotp(password, code), 'Authentification à deux facteurs désactivée.').then((ok) => { if (ok) { onStatusChange({ enabled: false, verified_at: null, recovery_codes_remaining: 0 }); notifyNotificationsChanged() } })}>Désactiver</button></>}
  </section>
}

function TotpCodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  const replaceDigit = (index: number, digit: string) => {
    const next = [...digits]
    next[index] = digit
    onChange(next.join('').replace(/\s/g, ''))
  }
  return <div className="totp-code-input" role="group" aria-label="Code à 6 chiffres" onPaste={(event) => { const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (!pasted) return; event.preventDefault(); onChange(pasted); inputs.current[Math.min(pasted.length, 6) - 1]?.focus() }}>{digits.map((digit, index) => <input key={index} ref={(node) => { inputs.current[index] = node }} aria-label={`Chiffre ${index + 1} du code`} inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={1} value={digit.trim()} onChange={(event) => { const nextDigit = event.target.value.replace(/\D/g, '').slice(-1); replaceDigit(index, nextDigit); if (nextDigit && index < 5) inputs.current[index + 1]?.focus() }} onKeyDown={(event) => { if (event.key === 'Backspace' && !digit.trim() && index > 0) { replaceDigit(index - 1, ' '); inputs.current[index - 1]?.focus() } if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus(); if (event.key === 'ArrowRight' && index < 5) inputs.current[index + 1]?.focus() }} />)}</div>
}

function RecoveryCodesPanel({ status, onStatusChange }: { status: TotpSecurityStatus; onStatusChange: (status: TotpSecurityStatus) => void }) {
  const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [recovery, setRecovery] = useState<TotpRecoveryCodes | null>(null); const [error, setError] = useState<string | null>(null)
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Copiez les codes affichés manuellement.') } }
  return <section className="account-security-dialog__form"><p className="account-card-description">La régénération invalide immédiatement tous les anciens codes de récupération.</p>{!recovery && <><label>Mot de passe actuel *<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Code d’authentification *<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} /></label><button className="account-button account-button--primary" type="button" disabled={!password || !code} onClick={() => void regenerateTotpRecoveryCodes(password, code).then((value) => { setRecovery(value); onStatusChange({ ...status, recovery_codes_remaining: value.recovery_codes.length }) }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Impossible de régénérer les codes.'))}>Régénérer les codes</button></>}{recovery && <><p className="form-alert">Enregistrez ces codes maintenant. Ils ne seront plus affichés.</p><pre className="totp-recovery-codes">{recovery.recovery_codes.join('\n')}</pre><button className="account-button account-button--secondary" type="button" onClick={() => void copy(recovery.recovery_codes.join('\n'))}>Copier tous les codes</button></>}{error && <p className="form-alert" role="alert">{error}</p>}</section>
}

function SessionsSection({ sessions, run, reload, embedded = false }: { sessions: AccountSession[]; run: (action: () => Promise<void>, success: string) => Promise<boolean>; reload: () => Promise<void>; embedded?: boolean }) {
  return <>{!embedded && <AccountHeading title="Sessions actives" description="Contrôlez les appareils connectés à votre compte." />}<div className="account-security-dialog__sessions-actions"><button className="account-button account-button--secondary account-button--danger-hover" type="button" onClick={() => void run(async () => { await revokeOtherAccountSessions(); await reload() }, 'Autres sessions révoquées.')}>Révoquer les autres sessions</button></div>{sessions.length === 0 ? <p className="account-info">Aucune session active.</p> : <ul className="account-sessions">{sessions.map((item) => { const details = describeSession(item); const DeviceIcon = details.mobile ? MonitorSmartphone : Monitor; return <li key={item.id}><DeviceIcon size={19} /><div><strong>{details.device}</strong><span>{details.location} · {details.browser} · {details.activity}</span>{item.is_current && <b>Session actuelle</b>}</div>{!item.is_current && <button className="panel-icon-button danger" type="button" aria-label="Révoquer cette session" onClick={() => void run(async () => { await revokeAccountSession(item.id); await reload() }, 'Session révoquée.')}><Trash2 size={15} /></button>}</li> })}</ul>}</>
}

function PreferenceCardHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  const displayTitle = title === 'Authentification à deux facteurs' ? 'Méthode par OTP' : title === 'Authentification à deux facteurs par e-mail' ? 'Authentification par e-mail' : title
  return <header className="account-preference-card__heading"><span className="account-preference-card__icon"><Icon size={19} aria-hidden="true" /></span><h3>{displayTitle}</h3></header>
}

type ApiServiceTone = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'loading'
type ApiServiceState = { label: string; tone: ApiServiceTone; date: string | null }

function ApiServiceBadge({ state }: { state: ApiServiceState }) {
  const Icon = state.tone === 'success' || state.tone === 'info' ? CheckCircle2 : state.tone === 'error' || state.tone === 'warning' ? AlertTriangle : KeyRound
  return <span className={`account-api-service-badge is-${state.tone}`}><Icon size={13} aria-hidden="true" />{state.label}</span>
}

function PreferenceField({ icon: Icon, label, htmlFor, help, description, children, className = '' }: { icon?: LucideIcon; label: string; htmlFor: string; help?: ReactNode; description?: string; children: ReactNode; className?: string }) {
  return <div className={`account-preference-field ${className}`.trim()}>
    <div className="account-preference-field__identity">{Icon && <Icon size={17} aria-hidden="true" />}<div><div className="account-preference-field__label"><label id={`${htmlFor}-label`} htmlFor={htmlFor}>{label}</label>{help && <FieldHelp>{help}</FieldHelp>}</div>{description && <p>{description}</p>}</div></div>
    {children}
  </div>
}

function PreferencesSection({ preferences, setPreferences }: { preferences: AccountPreferences; setPreferences: (preferences: AccountPreferences) => void }) {
  const { t } = useI18n()
  const update = <K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) => setPreferences({ ...preferences, [key]: value })
  return <><AccountHeading title={t('account.preferences.title')} description={t('account.preferences.description')} /><div className="account-form account-preferences-form">
    <section className="account-preference-card">
      <PreferenceCardHeading icon={Settings2} title={t('account.preferences.interface')} />
      <div className="account-preference-grid">
        <div className="account-preference-field account-preference-field--wide account-theme-preference"><div className="account-preference-field__identity"><Moon size={17} aria-hidden="true" /><div><div className="account-preference-field__label"><span id="account-theme-label">{t('account.preferences.defaultTheme')}</span></div><p>{t('account.preferences.defaultThemeHelp')}</p></div></div><div className="account-segmented-choice account-theme-choice" role="group" aria-labelledby="account-theme-label"><button type="button" className={preferences.default_theme === 'light' ? 'is-selected' : ''} onClick={() => update('default_theme', 'light')}><Sun size={15} />{t('account.preferences.light')}</button><button type="button" className={preferences.default_theme === 'dark' ? 'is-selected' : ''} onClick={() => update('default_theme', 'dark')}><Moon size={15} />{t('account.preferences.dark')}</button><button type="button" className={preferences.default_theme === 'system' ? 'is-selected' : ''} onClick={() => update('default_theme', 'system')}><Monitor size={15} />{t('account.preferences.system')}</button></div></div>
        <PreferenceField icon={Globe2} label={t('common.language')} htmlFor="account-language" description={t('account.preferences.languageDescription')}>
          <select id="account-language" aria-labelledby="account-language-label" value={preferences.language} onChange={(event) => update('language', event.target.value as AccountPreferences['language'])}><option value="fr">{t('common.french')}</option><option value="en">{t('common.english')}</option></select>
        </PreferenceField>
        <PreferenceField icon={List} label={t('account.preferences.density')} htmlFor="account-density" description={t('account.preferences.densityDescription')}>
          <select id="account-density" aria-labelledby="account-density-label" value={preferences.density} onChange={(event) => update('density', event.target.value as AccountPreferences['density'])}><option value="compact">{t('account.preferences.compact')}</option><option value="comfortable">{t('account.preferences.comfortable')}</option><option value="spacious">{t('account.preferences.spacious')}</option></select>
        </PreferenceField>
        <PreferenceField icon={LayoutDashboard} label={t('account.preferences.startup')} htmlFor="account-startup" description={t('account.preferences.startupDescription')}>
          <select id="account-startup" aria-labelledby="account-startup-label" value={preferences.startup_panel} onChange={(event) => update('startup_panel', event.target.value as AccountPreferences['startup_panel'])}><option value="dashboard">{t('dashboard.title')}</option><option value="maps">{t('nav.maps')}</option><option value="places">{t('nav.places')}</option><option value="last">{t('account.preferences.lastView')}</option></select>
        </PreferenceField>
        <TimezoneCombobox value={preferences.timezone} label={t('account.preferences.timezone')} onChange={(timezone) => update('timezone', timezone)} />
        <PreferenceField icon={Trash2} label={t('account.preferences.trashRetention')} htmlFor="account-trash-retention" description={t('account.preferences.trashDescription')}>
          <select id="account-trash-retention" aria-labelledby="account-trash-retention-label" value={preferences.trash_retention_days} onChange={(event) => update('trash_retention_days', Number(event.target.value))}>{[7, 14, 30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {t('account.preferences.days')}</option>)}</select>
        </PreferenceField>
        <PreferenceField icon={ImageIcon} label={t('account.preferences.photoMarkers')} htmlFor="account-photo-markers" description={t('account.preferences.photoMarkersDescription')}>
          <label className="cv-toggle account-preference-toggle"><input id="account-photo-markers" type="checkbox" role="switch" checked={preferences.photo_markers_enabled} onChange={(event) => update('photo_markers_enabled', event.target.checked)} /><i aria-hidden="true" /><span>{preferences.photo_markers_enabled ? t('account.preferences.enabled') : t('account.preferences.disabled')}</span></label>
        </PreferenceField>
      </div>
    </section>
    <IntegrationPreferences preferences={preferences} setPreferences={setPreferences} />
    <div className="account-preferences-form__actions"><button className="account-button account-button--secondary" type="button" onClick={() => setPreferences(emptyPreferences)}>{t('account.preferences.reset')}</button>
  </div></div></>
}

function TimezoneCombobox({ value, label, onChange }: { value: string; label: string; onChange: (timezone: string) => void }) {
  const { t } = useI18n()
  return <div className="account-preference-field account-timezone-combobox">
    <div className="account-preference-field__identity"><Clock3 size={17} aria-hidden="true" /><div><div className="account-preference-field__label"><label htmlFor="account-timezone">{label}</label></div><p>{t('account.preferences.timezoneDescription')}</p></div></div>
    <select
      id="account-timezone"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >{supportedTimeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone}</option>)}</select>
  </div>
}

function DangerSection({ profile, run, embedded = false }: { profile: AccountProfile; run: (action: () => Promise<void>, success: string) => Promise<boolean>; embedded?: boolean }) {
  const [confirmation, setConfirmation] = useState(''); const [password, setPassword] = useState(''); const [acknowledged, setAcknowledged] = useState(false)
  const ready = profile.can_delete && confirmation === 'SUPPRIMER MON COMPTE' && password.length > 0 && acknowledged
  return <>{!embedded && <AccountHeading title="Zone sensible" description="La suppression désactive et anonymise définitivement votre compte." />}<p className="account-card-description">La suppression désactive et anonymise définitivement votre compte.</p><div className="account-danger-summary"><p>{profile.owned_maps.length} carte(s) possédée(s), {profile.shared_map_count} carte(s) partagée(s).</p>{profile.owned_maps.length > 0 && <><strong>Transférez ou supprimez d’abord :</strong><ul>{profile.owned_maps.map((map) => <li key={map.id}>{map.name}</li>)}</ul></>}</div><form className="account-form danger account-security-dialog__form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await deleteOwnAccount(password, confirmation, acknowledged); window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)) }, 'Compte supprimé.') }}><label>Mot de passe actuel<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><label>Recopiez SUPPRIMER MON COMPTE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="SUPPRIMER MON COMPTE" required /></label><label className="checkbox-field"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Je comprends que cette action est définitive.</label><button className="account-button account-button--danger" type="submit" disabled={!ready}>Supprimer mon compte</button></form></>
}

function AccountHeading({ title, description }: { title: string; description: string }) { return <header className="account-content-heading"><p className="cv-workspace-panel__eyebrow">Compte</p><h2>{title}</h2><span>{description}</span></header> }
function formatDate(value: string, withTime = false): string { return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(value)) }

function describeSession(session: AccountSession): { device: string; browser: string; location: string; activity: string; mobile: boolean } {
  const liveNavigator = session.is_current && typeof navigator !== 'undefined' ? navigator as Navigator & { brave?: unknown } : null
  const agent = liveNavigator?.userAgent || session.user_agent || ''
  const mobile = /iPhone|iPad|Android|Mobile/i.test(agent)
  let device = 'Appareil inconnu'
  if (/iPad/i.test(agent)) device = 'iPad (iPadOS)'
  else if (/iPhone/i.test(agent)) device = 'iPhone (iOS)'
  else if (/Android/i.test(agent)) device = /Mobile/i.test(agent) ? 'Téléphone Android' : 'Appareil Android'
  else if (/Macintosh|Mac OS X/i.test(agent)) device = 'Mac (macOS)'
  else if (/Windows/i.test(agent)) device = 'PC Windows'
  else if (/Linux/i.test(agent)) device = 'PC Linux'

  let browser = 'Navigateur inconnu'
  if (liveNavigator?.brave) browser = 'Brave'
  else if (/EdgA?\//i.test(agent)) browser = 'Edge'
  else if (/OPR\//i.test(agent)) browser = 'Opera'
  else if (/FxiOS\//i.test(agent) || /Firefox\//i.test(agent)) browser = 'Firefox'
  else if (/CriOS\//i.test(agent) || /Chrome\//i.test(agent)) browser = 'Chrome'
  else if (/Safari\//i.test(agent) && /Version\//i.test(agent)) browser = 'Safari'

  const location = session.city && session.country ? `${session.city}, ${session.country}` : session.country || 'Localisation inconnue'
  return { device, browser, location, activity: formatSessionActivity(session.last_used_at), mobile }
}

function formatSessionActivity(value: string): string {
  const elapsedMs = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 1) return 'À l’instant'
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Il y a ${days} j`
  return formatDate(value)
}
function messageFor(reason: unknown, fallback: string): string { return reason instanceof Error ? `${fallback} ${reason.message}` : fallback }
