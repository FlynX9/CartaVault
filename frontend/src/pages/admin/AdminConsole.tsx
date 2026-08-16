import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { IconShieldCheck, IconUserCheck } from '@tabler/icons-react'
import { Activity, Check, ChevronLeft, ChevronRight, Database, Download, FileText, Gauge, ImageDown, Info, KeyRound, MapPinned, RefreshCw, Save, Settings2, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import {
  assignUserQuotaProfile, cancelBackgroundTask, getAdminUserActivity, getAdminUserDetails, getAdminUsers, getBackgroundTask, getMediaUploadSettings, getQuotaProfiles,
  getInstanceLogRetention, getSaasSettings, optimizeStoredMedia, saveInstanceLogRetention, saveMediaUploadSettings, saveSaasSettings,
  updateAdminUser, cancelVectorBasemap, deleteVectorBasemap, getVectorBasemapLibrary, installVectorBasemap, saveVectorBasemapSettings, updateVectorBasemap,
  type VectorBasemapItem, type VectorBasemapSettings,
} from '../../api/adminConsole'
import { getAdminPrivacySettings, saveAdminPrivacySettings, type PrivacyAnalyticsMode, type PrivacySettings } from '../../api/privacy'
import { accountAvatarUrl } from '../../api/account'
import { getGoogleSatelliteAdminStatus, resetGoogleSatelliteErrors, saveGoogleSatelliteSettings, type GoogleSatelliteAdminStatus } from '../../api/googleSatellite'
import { getPublicRegistrationSettings, getRegistrationRequests, reviewRegistration, updatePublicRegistrationSettings, type RegistrationRequest } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { publishGlobalFeedback } from '../../components/common/globalFeedback'
import { CountryFlag } from '../../components/maps/CountryFlag'
import { useI18n } from '../../i18n/useI18n'
import { InstanceStatusPage } from '../../features/admin/instance-status/InstanceStatusPage'
import { QuotaProfilesPage } from '../../features/admin/quotas/QuotaProfilesPage'
import { AdminUsersSection } from './AdminUsersSection'
import { AdminUserModal } from './AdminUserModal'
import { AdminApiKeysSection } from './AdminApiKeysSection'
import { AdminPublicRegistrationSection } from './AdminPublicRegistrationSection'
import { AdminSaveContext, useAdminSaveEntry, type AdminSaveContextValue, type AdminSaveEntry } from './adminSaveContext'
import type { AdminRole, AdminUser, AdminUserActivity, AdminUserDetails, AdminUserPage, AdminUserState, QuotaProfile } from '../../types/adminConsole'

const sections = [
  ['general', Settings2, 'admin.sections.general'], ['users', Users, 'admin.sections.users'], ['credentials', KeyRound, 'admin.sections.apiKeys'],
  ['quotas', Gauge, 'admin.sections.quotas'], ['instance', Activity, 'admin.sections.instance'],
] as const

type AdminSectionKey = typeof sections[number][0]
export function AdminConsole({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const modal = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [saveEntries, setSaveEntries] = useState<Record<string, AdminSaveEntry>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const activeSection = sections.find(([path]) => location.pathname === `/admin/${path}`)?.[0] ?? 'general'
  const [visitedSections, setVisitedSections] = useState<Set<AdminSectionKey>>(() => new Set([activeSection]))
  const saveContext = useMemo<AdminSaveContextValue>(() => ({
    register: (id, entry) => setSaveEntries((current) => current[id] === entry ? current : { ...current, [id]: entry }),
    unregister: (id) => setSaveEntries((current) => { if (!(id in current)) return current; const next = { ...current }; delete next[id]; return next }),
  }), [])
  const dirtyEntries = Object.values(saveEntries).filter((entry) => entry.dirty)
  const hasDirtyChanges = dirtyEntries.length > 0
  const performClose = useCallback(() => { if (onClose) onClose(); else navigate('/') }, [navigate, onClose])
  const requestClose = useCallback(() => { if (hasDirtyChanges) setClosePromptOpen(true); else performClose() }, [hasDirtyChanges, performClose])
  const saveAll = useCallback(async () => {
    const entries = Object.values(saveEntries).filter((entry) => entry.dirty)
    if (entries.length === 0) return true
    setSavingAll(true)
    try {
      for (const entry of entries) await entry.save()
      publishGlobalFeedback('success', `Paramètres d’administration enregistrés : ${entries.map((entry) => entry.label).join(', ')}.`)
      return true
    }
    catch {
      publishGlobalFeedback('error', `Échec de l’enregistrement des paramètres d’administration : ${entries.map((entry) => entry.label).join(', ')}.`)
      return false
    }
    finally { setSavingAll(false) }
  }, [saveEntries])
  useEffect(() => { setVisitedSections((current) => current.has(activeSection) ? current : new Set([...current, activeSection])) }, [activeSection])
  useEffect(() => { if (location.pathname === '/admin') navigate('/admin/general', { replace: true }) }, [location.pathname, navigate])
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      const nestedModal = document.querySelector('[role="alertdialog"][aria-modal="true"]')
      if (nestedModal !== null && !modal.current?.contains(nestedModal)) return
      if (event.key === 'Escape') { event.preventDefault(); if (closePromptOpen) setClosePromptOpen(false); else requestClose(); return }
      if (event.key !== 'Tab' || !modal.current) return
      const focusable = [...modal.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0]; const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [closePromptOpen, requestClose])
  useEffect(() => {
    window.addEventListener('cartavault:close-mobile-modal-layers', requestClose)
    return () => window.removeEventListener('cartavault:close-mobile-modal-layers', requestClose)
  }, [requestClose])
  return createPortal(<div className="account-overlay admin-console-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
    <section ref={modal} className="admin-console" role="dialog" aria-modal="true" aria-labelledby="admin-console-title">
      <header className="admin-console__header"><div className="admin-console__header-icon"><ShieldCheck size={20} /></div><div><h2 id="admin-console-title">{t('admin.title')}</h2><p>{t('admin.description')}</p></div><div className="admin-console__header-actions"><button className="primary-button admin-console__save-all" type="button" disabled={!hasDirtyChanges || savingAll || dirtyEntries.some((entry) => entry.busy)} onClick={() => void saveAll()}><Save size={15} />{savingAll ? t('admin.saving') : t('admin.save')}</button><button ref={closeButton} className="panel-icon-button modal-header-close" type="button" aria-label={t('admin.close')} onClick={requestClose}><X size={14} /></button></div></header>
      <nav className="admin-console__nav" aria-label={t('admin.navigation')}>
        {sections.map(([path, Icon, label]) => <NavLink key={path} to={{ pathname: `/admin/${path}`, search: location.search }}><Icon size={18} /><span>{t(label)}</span></NavLink>)}
      </nav>
      <AdminSaveContext.Provider value={saveContext}><div className="admin-console__content">
        {visitedSections.has('users') && <div hidden={activeSection !== 'users'}><AdminUsersSection /></div>}
        {visitedSections.has('general') && <div hidden={activeSection !== 'general'}><AdminGeneralSection /></div>}
        {visitedSections.has('credentials') && <div hidden={activeSection !== 'credentials'}><AdminApiKeysSection /></div>}
        {visitedSections.has('quotas') && <div hidden={activeSection !== 'quotas'}><QuotaProfilesPage /></div>}
        {visitedSections.has('instance') && <div hidden={activeSection !== 'instance'}><InstanceStatusPage /></div>}
      </div></AdminSaveContext.Provider>
      {closePromptOpen && <div className="cv-overlay admin-unsaved-overlay account-admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosePromptOpen(false) }}><section className="cv-modal admin-unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-unsaved-title"><header><div><p className="cv-workspace-panel__eyebrow">{t('admin.unsaved.eyebrow')}</p><h2 id="admin-unsaved-title">{t('admin.unsaved.title')}</h2></div><button className="panel-icon-button" type="button" aria-label={t('admin.users.close')} onClick={() => setClosePromptOpen(false)}><X size={16} /></button></header><p>{t('admin.unsaved.description')}</p><footer><button className="secondary-button" type="button" onClick={() => setClosePromptOpen(false)}>{t('admin.unsaved.continue')}</button><button className="danger-button" type="button" onClick={() => { dirtyEntries.forEach((entry) => entry.discard()); setClosePromptOpen(false); performClose() }}>{t('admin.unsaved.discard')}</button><button className="primary-button" type="button" disabled={savingAll} onClick={() => void saveAll().then((saved) => { if (saved) { setClosePromptOpen(false); performClose() } })}><Save size={15} />{t('admin.save')}</button></footer></section></div>}
    </section>
  </div>, document.body)
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="admin-console__heading"><div><p className="cv-workspace-panel__eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>{action}</header>
}

export function LegacyAdminUsersSection() {
  const location = useLocation()
  const registrationHeading = useRef<HTMLHeadingElement>(null)
  const [result, setResult] = useState<AdminUserPage | null>(null)
  const [q, setQ] = useState(''); const [role, setRole] = useState<AdminRole | ''>(''); const [state, setState] = useState<AdminUserState | ''>('')
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [requests, setRequests] = useState<RegistrationRequest[]>([])
  const [publicRegistrationEnabled, setPublicRegistrationEnabled] = useState(false)
  const [registrationApprovalRequired, setRegistrationApprovalRequired] = useState(true)
  const [savingPublicRegistration, setSavingPublicRegistration] = useState(false)
  const [profiles, setProfiles] = useState<QuotaProfile[]>([])
  const [detailUser, setDetailUser] = useState<AdminUserDetails | null>(null)
  const [activityUser, setActivityUser] = useState<AdminUser | null>(null)
  const [activity, setActivity] = useState<AdminUserActivity[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [approvalProfiles, setApprovalProfiles] = useState<Record<string, string>>({})
  const { confirm, confirmationDialog } = useConfirmDialog({ overlayClassName: 'account-admin-modal-overlay' })
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true); setError(null)
    void Promise.all([getAdminUsers({ q: q.trim(), role, state, page }, signal), getRegistrationRequests(signal), getQuotaProfiles(signal), getPublicRegistrationSettings(signal)])
      .then(([users, registrations, nextProfiles, publicRegistration]) => {
        if (signal?.aborted) return
        setResult(users); setRequests(registrations); setProfiles(nextProfiles); setPublicRegistrationEnabled(publicRegistration.enabled); setRegistrationApprovalRequired(publicRegistration.approval_required)
        const defaultId = nextProfiles.find((profile) => profile.is_default)?.id
        if (defaultId) setApprovalProfiles((current) => Object.fromEntries(registrations.map((request) => [request.id, current[request.id] ?? defaultId])))
      })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [page, q, role, state])
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => load(controller.signal), 250); return () => { controller.abort(); window.clearTimeout(timer) } }, [load])
  const change = async (item: AdminUser, payload: { role?: AdminRole; is_active?: boolean }, label: string) => {
    const accepted = await confirm({ title: label, message: `Confirmer cette modification pour ${item.display_name} ?`, confirmLabel: 'Confirmer' })
    if (!accepted) return
    try { await updateAdminUser(item.id, payload); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') }
  }
  const decide = async (item: RegistrationRequest, decision: 'approve' | 'reject') => {
    try { await reviewRegistration(item.id, decision, approvalProfiles[item.id]); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Décision impossible.') }
  }
  const togglePublicRegistration = async () => {
    const enabled = !publicRegistrationEnabled
    const accepted = await confirm({ title: enabled ? 'Activer les inscriptions publiques' : 'Désactiver les inscriptions publiques', message: enabled ? 'Les inscriptions publiques seront activées. N’importe quelle personne pourra s’enregistrer.' : 'Les nouvelles demandes seront refusées. Celles déjà en attente restent à examiner.', confirmLabel: enabled ? 'Activer' : 'Désactiver' })
    if (!accepted) return
    setSavingPublicRegistration(true)
    try { const updated = await updatePublicRegistrationSettings({ enabled, approval_required: registrationApprovalRequired }); setPublicRegistrationEnabled(updated.enabled); setRegistrationApprovalRequired(updated.approval_required) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') } finally { setSavingPublicRegistration(false) }
  }
  const toggleRegistrationApproval = async () => {
    const approval_required = !registrationApprovalRequired
    setSavingPublicRegistration(true)
    try {
      const updated = await updatePublicRegistrationSettings({ enabled: publicRegistrationEnabled, approval_required })
      setPublicRegistrationEnabled(updated.enabled); setRegistrationApprovalRequired(updated.approval_required)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') } finally { setSavingPublicRegistration(false) }
  }
  const assignProfile = async (item: AdminUser, profileId: string) => {
    const profile = profiles.find((candidate) => candidate.id === profileId)
    if (!profile || profile.id === item.quota_profile_id) return
    const mapLimit = profile.limits.maps_max
    const overMapLimit = mapLimit !== null && item.owned_map_count > mapLimit
    const accepted = await confirm({
      title: 'Changer le profil de quotas',
      message: overMapLimit
        ? `${item.display_name} possède ${item.owned_map_count} cartes pour une limite de ${mapLimit}. Les données existantes seront conservées, mais toute nouvelle création sera bloquée jusqu’au retour sous la limite.`
        : `Remplacer ${item.quota_profile_name} par ${profile.name} pour ${item.display_name} ? Les données existantes ne seront jamais supprimées.`,
      confirmLabel: 'Affecter',
    })
    if (!accepted) return
    try {
      await assignUserQuotaProfile(item.id, profileId)
      setResult((current) => current ? { ...current, items: current.items.map((user) => user.id === item.id ? { ...user, quota_profile_id: profileId, quota_profile_name: profile.name } : user) } : current)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Affectation impossible.') }
  }
  const openDetails = async (item: AdminUser) => {
    setModalLoading(true)
    try { setDetailUser(await getAdminUserDetails(item.id)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger la fiche utilisateur.') }
    finally { setModalLoading(false) }
  }
  const openActivity = async (item: AdminUser) => {
    setActivityUser(item); setModalLoading(true)
    try { setActivity(await getAdminUserActivity(item.id)) } catch (reason) { setActivityUser(null); setError(reason instanceof Error ? reason.message : 'Impossible de charger l’historique.') }
    finally { setModalLoading(false) }
  }
  const pending = requests.filter((item) => item.status === 'pending')
  const awaitingEmail = requests.filter((item) => item.status === 'awaiting_email')
  useEffect(() => {
    if (new URLSearchParams(location.search).get('admin_notification') !== 'registration-requests' || pending.length === 0) return
    const frame = window.requestAnimationFrame(() => {
      registrationHeading.current?.scrollIntoView({ block: 'nearest' })
      registrationHeading.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.search, pending.length])
  return <section>
    <SectionHeading eyebrow="Accès" title="Utilisateurs" description="Comptes, rôles et état d’accès à CartaVault." />
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="admin-console__card admin-console__public-registration"><h3>Inscriptions publiques</h3><p>Autorisez les visiteurs à créer un compte sur cette instance.</p><div className="admin-console__public-registration-option"><label className="trip-view-toggle"><input type="checkbox" checked={publicRegistrationEnabled} disabled={savingPublicRegistration} onChange={() => void togglePublicRegistration()} /><i aria-hidden="true" /><span>Activer les inscriptions publiques</span></label><small>Les visiteurs peuvent créer leur compte depuis la page d’inscription.</small></div>{publicRegistrationEnabled === true && <div className="admin-console__public-registration-option"><label className="trip-view-toggle"><input type="checkbox" checked={registrationApprovalRequired} disabled={savingPublicRegistration} onChange={() => void toggleRegistrationApproval()} /><i aria-hidden="true" /><span>Validation des demandes</span></label><small>{registrationApprovalRequired ? 'Les comptes confirmés par e-mail doivent être validés par un administrateur.' : 'Les comptes confirmés par e-mail sont activés automatiquement.'}</small></div>}</section>
    {pending.length > 0 && <section className="admin-console__card"><h3 id="registration-requests-title" ref={registrationHeading} tabIndex={-1}>Demandes d’inscription <span>{pending.length}</span></h3><ul className="admin-console__rows">{pending.map((item) => <li key={item.id}><div><strong>{item.display_name}</strong><small>{item.email}</small></div><label className="admin-console__profile-select">Profil de quotas<select aria-label={`Profil de quotas pour ${item.email}`} value={approvalProfiles[item.id] ?? ''} onChange={(event) => setApprovalProfiles({ ...approvalProfiles, [item.id]: event.target.value })}>{profiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_default ? ' — par défaut' : ''}</option>)}</select></label><div className="admin-console__actions"><button aria-label={`Accepter ${item.email}`} onClick={() => void decide(item, 'approve')}><Check size={16} /></button><button className="danger" aria-label={`Refuser ${item.email}`} onClick={() => void decide(item, 'reject')}><X size={16} /></button></div></li>)}</ul></section>}
    {awaitingEmail.length > 0 && <section className="admin-console__card"><h3>Adresses à confirmer <span>{awaitingEmail.length}</span></h3><p>Ces comptes restent inactifs tant que leur adresse email n’est pas vérifiée.</p><ul className="admin-console__rows">{awaitingEmail.map((item) => <li key={item.id}><div><strong>{item.display_name}</strong><small>{item.email}</small></div><span className="admin-console__pending-state">Vérification en attente</span><div className="admin-console__actions"><button className="danger" aria-label={`Refuser ${item.email}`} onClick={() => void decide(item, 'reject')}><X size={16} /></button></div></li>)}</ul></section>}
    <section className="admin-console__card"><h3>Comptes <span>{result?.total ?? 0}</span></h3><div className="admin-console__filters"><label>Recherche<input type="search" value={q} placeholder="Nom ou adresse email" onChange={(event) => { setQ(event.target.value); setPage(1) }} /></label><label>Rôle<select value={role} onChange={(event) => { setRole(event.target.value as AdminRole | ''); setPage(1) }}><option value="">Tous</option><option value="admin">Administrateurs</option><option value="user">Utilisateurs</option></select></label><label>État<select value={state} onChange={(event) => { setState(event.target.value as AdminUserState | ''); setPage(1) }}><option value="">Tous</option><option value="active">Actifs</option><option value="inactive">Inactifs</option><option value="deleted">Supprimés</option></select></label></div>{loading ? <p role="status">Chargement…</p> : result?.items.length === 0 ? <p>Aucun utilisateur trouvé.</p> : <ul className="admin-console__user-grid">{result?.items.map((item) => <li key={item.id}>
      <div className="admin-console__avatar" aria-hidden="true">{item.avatar_url ? <img src={accountAvatarUrl(item.avatar_url) ?? undefined} alt="" /> : item.display_name.charAt(0).toUpperCase()}</div><div className="admin-console__user-identity"><div className="admin-console__user-name-row"><strong>{item.display_name}</strong><div className="admin-console__badges"><span className={item.role}>{item.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span><span className={item.state}>{item.state === 'active' ? 'Actif' : item.state === 'inactive' ? 'Inactif' : 'Supprimé'}</span></div></div><small>{item.email}</small><div className="admin-console__user-metrics" aria-label={`Activité de ${item.display_name}`}><span><b>{item.owned_map_count}</b> carte{item.owned_map_count === 1 ? '' : 's'}</span><span><b>{item.shared_map_count}</b> partage{item.shared_map_count === 1 ? '' : 's'}</span><span><b>{item.place_count}</b> POI</span></div><p>Dernière connexion {item.last_login_at ? new Date(item.last_login_at).toLocaleDateString('fr-FR') : 'jamais'}</p></div>
      <label className="admin-console__profile-select admin-console__user-quota">Quotas<select aria-label={`Profil de quotas de ${item.email}`} value={item.quota_profile_id} onChange={(event) => void assignProfile(item, event.target.value)}>{profiles.filter((profile) => profile.is_active || profile.id === item.quota_profile_id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
      {item.state !== 'deleted' && <div className="admin-console__user-actions"><button onClick={() => void change(item, { role: item.role === 'admin' ? 'user' : 'admin' }, 'Modifier le rôle')}>{item.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}</button><button className={item.state === 'active' ? 'danger' : ''} onClick={() => void change(item, { is_active: item.state !== 'active' }, item.state === 'active' ? 'Désactiver le compte' : 'Activer le compte')}>{item.state === 'active' ? 'Désactiver' : 'Activer'}</button></div>}
      <div className="admin-console__user-inspect-actions"><button type="button" onClick={() => void openDetails(item)}>Voir les détails</button><button type="button" onClick={() => void openActivity(item)}>Historique d’activité</button></div>
    </li>)}</ul>}
    {result && <footer className="admin-console__pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />Précédent</button><span>Page {result.page} sur {result.pages}</span><button disabled={page >= result.pages} onClick={() => setPage((value) => value + 1)}>Suivant<ChevronRight size={16} /></button></footer>}</section>{confirmationDialog}
    {(detailUser || activityUser || modalLoading) && <AdminUserModal detail={detailUser} activityUser={activityUser} activity={activity} loading={modalLoading} onClose={() => { setDetailUser(null); setActivityUser(null); setActivity([]) }} />}
  </section>
}

function AdminGeneralSection() {
  const { t } = useI18n()
  return <section><SectionHeading eyebrow={t('admin.general.eyebrow')} title={t('admin.general.title')} description={t('admin.general.description')} /><AdminPublicRegistrationSection /><SaasSettingsPanel /><VectorBasemapSettingsPanel /><PrivacySettingsPanel /><MediaMaintenancePanel /><LogRetentionPanel /></section>
}

const ACTIVE_VECTOR_STATES = new Set(['downloading', 'generating', 'validating', 'deleting'])
const vectorStateLabels: Record<string, string> = { not_installed: 'Non installé', downloading: 'Téléchargement', generating: 'Génération', validating: 'Validation', ready: 'Disponible', update_available: 'Mise à jour disponible', error: 'Erreur', deleting: 'Suppression' }
function countryFlag(code: string) { return [...code.toUpperCase()].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('') }
function formatBasemapSize(value: number | null) { if (value === null) return 'Taille inconnue'; const units = ['o', 'Ko', 'Mo', 'Go']; let size = value; let unit = 0; while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1 } return `${size.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}` }
function VectorBasemapProgress({ item }: { item: VectorBasemapItem }) {
  if (!ACTIVE_VECTOR_STATES.has(item.state) || item.progress === null) return null
  const value = Math.min(100, Math.max(0, item.progress))
  return <div className="admin-vector-basemaps__progress" role="progressbar" aria-label={`${item.phase ?? vectorStateLabels[item.state]} de ${item.country_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i style={{ width: `${value}%` }} /></div>
}

function VectorBasemapSettingsPanel() {
  const [settings, setSettings] = useState<VectorBasemapSettings | null>(null)
  const [saved, setSaved] = useState<VectorBasemapSettings | null>(null)
  const [items, setItems] = useState<VectorBasemapItem[]>([])
  const [selectedCountry, setSelectedCountry] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmationDialog } = useConfirmDialog({ overlayClassName: 'account-admin-modal-overlay' })
  const load = useCallback((signal?: AbortSignal) => getVectorBasemapLibrary(signal).then((library) => { setSettings((current) => current ?? library.settings); setSaved((current) => current ?? library.settings); setItems(library.items); setSelectedCountry((current) => current || library.items.find((item) => item.state === 'not_installed' && item.supported)?.country_code || '') }), [])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Fonds CartaVault indisponibles.') }); return () => controller.abort() }, [load])
  useEffect(() => { if (!items.some((item) => ACTIVE_VECTOR_STATES.has(item.state))) return; const timer = window.setInterval(() => void getVectorBasemapLibrary().then((value) => setItems(value.items)).catch(() => undefined), 1800); return () => window.clearInterval(timer) }, [items])
  const updateSetting = <K extends keyof VectorBasemapSettings>(key: K, value: VectorBasemapSettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current)
  const save = useCallback(async () => { if (!settings) return; setBusy(true); setError(null); try { const next = await saveVectorBasemapSettings(settings); setSettings(next); setSaved(next) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); throw reason } finally { setBusy(false) } }, [settings])
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)
  useAdminSaveEntry('general-vector-basemaps', useMemo(() => ({ label: 'fonds CartaVault', dirty, busy, save, discard: () => setSettings(saved) }), [busy, dirty, save, saved]))
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(null); try { await action(); const library = await getVectorBasemapLibrary(); setItems(library.items) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') } finally { setBusy(false) } }
  const remove = async (item: VectorBasemapItem) => { const accepted = await confirm({ title: `Supprimer le fond ${item.country_name}`, message: `Ce fond est utilisé par ${item.map_count} carte(s). Les packages déjà présents sur les appareils ne seront pas supprimés.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (accepted) await run(() => deleteVectorBasemap(item.country_code)) }
  const installed = items.filter((item) => item.state !== 'not_installed')
  const available = items.filter((item) => item.state === 'not_installed')
  const selectedItem = items.find((item) => item.country_code === selectedCountry)
  return <><section className="admin-console__card admin-console__setting-card admin-vector-basemaps" aria-labelledby="vector-basemap-title">
    <header className="admin-console__setting-header"><span className="admin-console__setting-icon"><MapPinned size={17} /></span><div><h3 id="vector-basemap-title">Fond de carte CartaVault</h3><p>Prépare automatiquement des fonds OpenStreetMap vectoriels par pays, utilisables en ligne et hors ligne.</p></div><label className="cv-toggle admin-console__setting-toggle"><input type="checkbox" role="switch" aria-label="Activer le fond CartaVault" checked={settings?.enabled ?? false} disabled={!settings || busy} onChange={(event) => updateSetting('enabled', event.target.checked)} /><i aria-hidden="true" /></label></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {settings && <form className="admin-vector-basemaps__settings" onSubmit={(event) => event.preventDefault()}><label>Préparation automatique<select value={settings.preparation_policy} onChange={(event) => updateSetting('preparation_policy', event.target.value as VectorBasemapSettings['preparation_policy'])}><option value="on_map_creation">À la création d’une carte</option><option value="on_first_cartavault_use">À la première utilisation du fond CartaVault</option><option value="on_first_offline_use">Lors du premier téléchargement hors ligne</option><option value="manual">Manuellement</option></select></label><label>Mise à jour automatique<select value={settings.update_policy} onChange={(event) => updateSetting('update_policy', event.target.value as VectorBasemapSettings['update_policy'])}><option value="disabled">Désactivée</option><option value="monthly">Mensuelle</option><option value="quarterly">Trimestrielle</option></select></label><label>Zoom offline minimum<input type="number" min="0" max={settings.offline_max_zoom} value={settings.offline_min_zoom} onChange={(event) => updateSetting('offline_min_zoom', Number(event.target.value))} /></label><label>Zoom offline maximum<input type="number" min={settings.offline_min_zoom} max={settings.max_zoom} value={settings.offline_max_zoom} onChange={(event) => updateSetting('offline_max_zoom', Number(event.target.value))} /></label><label>Marge autour des sorties<span className="admin-vector-basemaps__unit"><input type="number" min="0" max="500" value={settings.offline_padding_km} onChange={(event) => updateSetting('offline_padding_km', Number(event.target.value))} /><em>km</em></span></label><label>Maximum de tuiles par package<input type="number" min="100" max="250000" value={settings.offline_max_tiles} onChange={(event) => updateSetting('offline_max_tiles', Number(event.target.value))} /></label></form>}
    <section className="admin-vector-basemaps__library"><h4><Database size={16} />Fonds installés</h4>{installed.length === 0 ? <p className="admin-vector-basemaps__empty">Aucun fond n’est encore installé.</p> : <div className="admin-vector-basemaps__cards">{installed.map((item) => <article key={item.country_code} data-state={item.state}><CountryFlag countryCode={item.country_code} className="admin-vector-basemaps__flag" fallbackSize={22} /><div><strong>{item.country_name}</strong><span className={`admin-vector-basemaps__badge is-${item.state}`}>{vectorStateLabels[item.state]}</span><small>{item.phase}{item.progress !== null ? ` · ${item.progress} %` : ''}</small><VectorBasemapProgress item={item} />{item.state === 'ready' || item.state === 'update_available' ? <small>{formatBasemapSize(item.file_size)} · {item.version}</small> : null}{item.error_message && <small className="is-error">{item.error_message}</small>}</div><div className="admin-vector-basemaps__actions">{ACTIVE_VECTOR_STATES.has(item.state) ? <button type="button" disabled={busy} onClick={() => void run(() => cancelVectorBasemap(item.country_code))}>Annuler</button> : <><button type="button" disabled={busy} onClick={() => void run(() => item.state === 'error' ? installVectorBasemap(item.country_code) : updateVectorBasemap(item.country_code))}><RefreshCw size={14} />{item.state === 'error' ? 'Réessayer' : 'Mettre à jour'}</button>{(item.state === 'ready' || item.state === 'update_available') && <button className="danger" type="button" disabled={busy} onClick={() => void remove(item)}><Trash2 size={14} />Supprimer</button>}</>}</div></article>)}</div>}</section>
    <section className="admin-vector-basemaps__add"><h4><Download size={16} />Ajouter un fond</h4><label>Pays<select value={selectedCountry} onChange={(event) => setSelectedCountry(event.target.value)}>{available.map((item) => <option key={item.country_code} value={item.country_code} disabled={!item.supported}>{countryFlag(item.country_code)} {item.country_name}{item.supported ? '' : ' — indisponible'}</option>)}</select></label><button className="primary-button" type="button" disabled={busy || !selectedCountry || !selectedItem?.supported} onClick={() => void run(() => installVectorBasemap(selectedCountry))}><Download size={15} />Télécharger et préparer</button></section>
    <p className="admin-console__hint admin-console__setting-note"><Info size={17} />Les données proviennent d’extraits Geofabrik contrôlés. Planetiler s’exécute uniquement pendant la préparation ; un seul fond est généré à la fois.</p>
  </section>{confirmationDialog}</>
}

function PrivacySettingsPanel() {
  const [settings, setSettings] = useState<PrivacySettings | null>(null)
  const [saved, setSaved] = useState<PrivacySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastEnabledAnalyticsMode = useRef<Exclude<PrivacyAnalyticsMode, 'disabled'>>('privacy_preserving')
  useEffect(() => {
    const controller = new AbortController()
    void getAdminPrivacySettings(controller.signal).then((value) => { if (!controller.signal.aborted) { if (value.analytics_mode !== 'disabled') lastEnabledAnalyticsMode.current = value.analytics_mode; setSettings(value); setSaved(value) } }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Réglages de confidentialité indisponibles.') })
    return () => controller.abort()
  }, [])
  const update = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current)
  const updateAnalyticsMode = (value: Exclude<PrivacyAnalyticsMode, 'disabled'>) => { lastEnabledAnalyticsMode.current = value; update('analytics_mode', value) }
  const privacyEnabled = settings?.analytics_mode === 'privacy_preserving' || settings?.analytics_mode === 'consent_required'
  const save = useCallback(async () => {
    if (!settings) return
    setBusy(true); setError(null)
    try {
      const { consent_required, consent_version, ...payload } = settings
      void consent_required; void consent_version
      const next = await saveAdminPrivacySettings(payload)
      setSettings(next); setSaved(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); throw reason }
    finally { setBusy(false) }
  }, [settings])
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved)
  const entry = useMemo<AdminSaveEntry>(() => ({ label: 'confidentialité', dirty, busy, save, discard: () => setSettings(saved) }), [busy, dirty, save, saved])
  useAdminSaveEntry('general-privacy', entry)
  return <section className="admin-console__card admin-console__setting-card admin-privacy-settings" aria-labelledby="privacy-settings-title">
    <header className="admin-console__setting-header"><span className="admin-console__setting-icon"><ShieldCheck size={17} /></span><div><h3 id="privacy-settings-title">Confidentialité et conformité</h3><p>Configurez l’opérateur, les politiques et les durées de conservation de l’instance.</p></div><label className="cv-toggle admin-console__setting-toggle"><input type="checkbox" role="switch" aria-label="Activer la confidentialité et la conformité" checked={privacyEnabled} disabled={!settings || busy} onChange={(event) => update('analytics_mode', event.target.checked ? lastEnabledAnalyticsMode.current : 'disabled')} /><i aria-hidden="true" /></label></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {settings && privacyEnabled && <form className="admin-console__setting-form admin-privacy-settings__form" onSubmit={(event) => event.preventDefault()}>
      <section className="admin-privacy-settings__policy"><h4>Gestion du consentement</h4><div className="admin-privacy-settings__analytics" role="group" aria-label="Gestion du consentement"><button type="button" className={settings.analytics_mode === 'privacy_preserving' ? 'is-selected' : ''} aria-pressed={settings.analytics_mode === 'privacy_preserving'} disabled={busy} onClick={() => updateAnalyticsMode('privacy_preserving')}><IconShieldCheck size={20} /><span><strong>Respect de la vie privée</strong><small>Aucun consentement requis tant qu’aucun service optionnel ne collecte de données.</small></span></button><button type="button" className={settings.analytics_mode === 'consent_required' ? 'is-selected' : ''} aria-pressed={settings.analytics_mode === 'consent_required'} disabled={busy} onClick={() => updateAnalyticsMode('consent_required')}><IconUserCheck size={20} /><span><strong>Consentement requis</strong><small>Affiche une bannière de consentement lorsque certaines fonctionnalités l’exigent.</small></span></button></div></section>
      <section className="admin-privacy-settings__fields"><div><h4><FileText size={16} />Informations légales</h4><label>Nom de l’instance<input value={settings.operator_name} maxLength={160} onChange={(event) => update('operator_name', event.target.value)} /></label><label>Contact de l’instance<input type="email" value={settings.contact_email} maxLength={320} placeholder="admin@exemple.fr" onChange={(event) => update('contact_email', event.target.value)} /></label></div><div><h4><ShieldCheck size={16} />Politiques</h4><label>URL politique de confidentialité<input type="url" value={settings.privacy_policy_url} maxLength={2048} placeholder="https://exemple.fr/confidentialite" onChange={(event) => update('privacy_policy_url', event.target.value)} /></label><label>URL politique de cookies<input type="url" value={settings.cookie_policy_url} maxLength={2048} placeholder="https://exemple.fr/cookies" onChange={(event) => update('cookie_policy_url', event.target.value)} /></label></div></section>
      <section className="admin-privacy-settings__retention"><h4><Activity size={16} />Conservation</h4><div><label>Journaux d’authentification<span className="admin-privacy-settings__duration"><input type="number" min="1" max="3650" value={settings.auth_log_retention_days} onChange={(event) => update('auth_log_retention_days', Number(event.target.value))} /><em>jours</em></span></label><label>Sessions<span className="admin-privacy-settings__duration"><input type="number" min="1" max="365" value={settings.session_retention_days} onChange={(event) => update('session_retention_days', Number(event.target.value))} /><em>jours</em></span></label></div><p className="admin-privacy-settings__retention-help">Les journaux antérieurs à cette durée sont automatiquement supprimés.</p></section>
      <p className="admin-console__hint admin-console__setting-note"><Info size={17} />Par défaut, CartaVault n’utilise aucun service d’analyse ou de marketing : aucune bannière de consentement n’est donc nécessaire. Lorsqu’un compte est supprimé, ses données personnelles sont anonymisées afin de préserver l’intégrité des données associées.</p>
    </form>}
  </section>
}

function SaasSettingsPanel() {
  const [enabled, setEnabled] = useState(false)
  const [savedEnabled, setSavedEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void getSaasSettings(controller.signal)
      .then((settings) => { if (!controller.signal.aborted) { setEnabled(settings.enabled); setSavedEnabled(settings.enabled) } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Réglage SaaS indisponible.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const save = useCallback(async () => {
    setBusy(true); setError(null)
    try { const updated = await saveSaasSettings(enabled); setEnabled(updated.enabled); setSavedEnabled(updated.enabled) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); throw reason }
    finally { setBusy(false) }
  }, [enabled])
  const saasSaveEntry = useMemo<AdminSaveEntry>(() => ({ label: 'mode SaaS', dirty: enabled !== savedEnabled, busy, save, discard: () => setEnabled(savedEnabled) }), [busy, enabled, save, savedEnabled])
  useAdminSaveEntry('general-saas', saasSaveEntry)
  return <section className="admin-console__card admin-console__setting-card" aria-labelledby="saas-settings-title">
    <header className="admin-console__setting-header"><span className="admin-console__setting-icon"><ShieldCheck size={17} /></span><div><h3 id="saas-settings-title">Mode SaaS</h3><p>Active les fonctions destinées à une instance ouverte au public. Pour le moment, cela affiche le menu Contact aux utilisateurs.</p></div><label className="cv-toggle admin-console__setting-toggle"><input type="checkbox" role="switch" aria-label="Mode SaaS" checked={enabled} disabled={loading || busy} onChange={(event) => setEnabled(event.target.checked)} /><i aria-hidden="true" /></label></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
  </section>
}

function MediaMaintenancePanel() {
  const [limit, setLimit] = useState(5); const [maxDimension, setMaxDimension] = useState(2560); const [task, setTask] = useState<{ id: string; status: string; percent: number; message: string | null; result: Record<string, unknown> | null; error: string | null } | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [savedSettings, setSavedSettings] = useState({ limit: 5, maxDimension: 2560 })
  const { confirm, confirmationDialog } = useConfirmDialog({ overlayClassName: 'account-admin-modal-overlay' })
  useEffect(() => { const controller = new AbortController(); void getMediaUploadSettings(controller.signal).then((value) => { setLimit(value.max_upload_megabytes); setMaxDimension(value.max_image_dimension); setSavedSettings({ limit: value.max_upload_megabytes, maxDimension: value.max_image_dimension }) }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Réglage média indisponible.') }); return () => controller.abort() }, [])
  useEffect(() => {
    if (!task || !['pending', 'running'].includes(task.status)) return
    const timer = window.setInterval(() => { void getBackgroundTask(task.id).then((value) => setTask((current) => current ? { ...current, status: value.status, percent: value.percent, message: value.progress_message, result: value.result, error: value.error_message } : current)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Suivi impossible.')) }, 1200)
    return () => window.clearInterval(timer)
  }, [task])
  const save = useCallback(async () => {
    setError(null)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) { const reason = new Error('La taille maximale doit être comprise entre 1 et 100 Mo.'); setError(reason.message); throw reason }
    if (![1280, 1920, 2560, 3840].includes(maxDimension)) { const reason = new Error('La résolution maximale sélectionnée est invalide.'); setError(reason.message); throw reason }
    setBusy(true)
    try { const updated = await saveMediaUploadSettings(limit, maxDimension); setLimit(updated.max_upload_megabytes); setMaxDimension(updated.max_image_dimension); setSavedSettings({ limit: updated.max_upload_megabytes, maxDimension: updated.max_image_dimension }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); throw reason }
    finally { setBusy(false) }
  }, [limit, maxDimension])
  const mediaSaveEntry = useMemo<AdminSaveEntry>(() => ({ label: 'médiathèque', dirty: limit !== savedSettings.limit || maxDimension !== savedSettings.maxDimension, busy, save, discard: () => { setLimit(savedSettings.limit); setMaxDimension(savedSettings.maxDimension) } }), [busy, limit, maxDimension, save, savedSettings])
  useAdminSaveEntry('general-media', mediaSaveEntry)
  const optimize = async () => { setBusy(true); setError(null); try { const started = await optimizeStoredMedia(); setTask({ id: started.task_id, status: started.status, percent: 0, message: 'Préparation…', result: null, error: null }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Optimisation impossible.') } finally { setBusy(false) } }
  const requestOptimize = async () => {
    const accepted = await confirm({
      title: 'Optimiser les médias existants',
      message: 'Cette opération peut prendre du temps et mobiliser des ressources serveur selon le nombre et la taille des images. Vous pouvez suivre sa progression après le lancement.',
      confirmLabel: 'Lancer l’optimisation',
      variant: 'positive',
    })
    if (accepted) await optimize()
  }
  const cancel = async () => { if (!task) return; try { await cancelBackgroundTask(task.id); setTask({ ...task, status: 'cancelled', message: 'Annulation demandée.' }) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Annulation impossible.') } }
  const active = task && ['pending', 'running'].includes(task.status)
  return <><section className="admin-console__card admin-console__setting-card admin-media-settings" aria-labelledby="media-maintenance-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><ImageDown size={17} /></span><div><h3 id="media-maintenance-title">Médiathèque</h3><p>Limite d’import, résolution et optimisation contrôlée des images déjà stockées.</p></div></header>{error && <div className="form-alert" role="alert">{error}</div>}<form className="admin-console__setting-form" onSubmit={(event) => event.preventDefault()}><label>Taille maximale par image (Mo)<input type="number" min="1" max="100" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label><label>Résolution maximale (plus grand côté)<select value={maxDimension} onChange={(event) => setMaxDimension(Number(event.target.value))}><option value={1280}>1 280 px — Compact</option><option value={1920}>1 920 px — HD</option><option value={2560}>2 560 px — Standard</option><option value={3840}>3 840 px — Haute qualité</option></select></label><p className="admin-console__hint admin-console__setting-note"><Info size={17} />Les images ne sont jamais agrandies. Ce réglage est appliqué aux nouveaux imports et lors de l’optimisation des médias existants.</p></form><div className="admin-console__setting-actions"><button type="button" className="primary-button" disabled={busy || !!active} onClick={() => void requestOptimize()}><ImageDown size={16} />Optimiser les médias existants</button>{active && <button type="button" className="danger" onClick={() => void cancel()}>Annuler</button>}</div>{task && <div className="admin-console__hint" role="status"><strong>{task.status === 'succeeded' ? 'Optimisation terminée' : task.status === 'failed' ? 'Optimisation en erreur' : task.status === 'cancelled' ? 'Optimisation annulée' : `${task.percent} %`}</strong><span>{task.message}</span>{task.result && <span> · {String(task.result.optimized ?? 0)} optimisé(s), {String(task.result.skipped ?? 0)} ignoré(s), {String(task.result.failed ?? 0)} erreur(s), {Math.round(Number(task.result.saved_bytes ?? 0) / 1024 / 1024 * 10) / 10} Mo libérés.</span>}{task.error && <span> · {task.error}</span>}</div>}</section>{confirmationDialog}</>
}

function LogRetentionPanel() {
  const [days, setDays] = useState(7); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const [savedDays, setSavedDays] = useState(7)
  useEffect(() => { const controller = new AbortController(); void getInstanceLogRetention(controller.signal).then((value) => { setDays(value.retention_days); setSavedDays(value.retention_days) }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Log settings unavailable.') }); return () => controller.abort() }, [])
  const save = useCallback(async () => {
    setError(null); setNotice(null)
    if (!Number.isInteger(days) || days < 1 || days > 365) { const reason = new Error('La durée de conservation doit être comprise entre 1 et 365 jours.'); setError(reason.message); throw reason }
    setBusy(true)
    try { const updated = await saveInstanceLogRetention(days); setDays(updated.retention_days); setSavedDays(updated.retention_days); setNotice('Durée de conservation enregistrée.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); throw reason }
    finally { setBusy(false) }
  }, [days])
  const logsSaveEntry = useMemo<AdminSaveEntry>(() => ({ label: 'journaux d’instance', dirty: days !== savedDays, busy, save, discard: () => setDays(savedDays) }), [busy, days, save, savedDays])
  useAdminSaveEntry('general-logs', logsSaveEntry)
  return <section className="admin-console__card admin-console__setting-card admin-log-settings" aria-labelledby="log-retention-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><Activity size={17} /></span><div><h3 id="log-retention-title">Journaux d’instance</h3><p>Les journaux applicatifs sont conservés en base puis nettoyés automatiquement après la durée choisie.</p></div></header>{error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="form-alert success" role="status">{notice}</div>}<form className="admin-console__setting-form" onSubmit={(event) => event.preventDefault()}><label>Durée de conservation (jours)<input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label></form><p className="admin-console__hint admin-console__setting-note"><Info size={17} />Valeur par défaut : 7 jours. Les messages sont filtrés pour retirer les secrets et limiter les données personnelles.</p></section>
}

export function GoogleSatelliteAdminPanel() {
  const [status, setStatus] = useState<GoogleSatelliteAdminStatus | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const load = useCallback((signal?: AbortSignal) => { void getGoogleSatelliteAdminStatus(signal).then(setStatus).catch((reason) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement Google Satellite impossible.') }) }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const run = async (action: () => Promise<GoogleSatelliteAdminStatus>) => { setBusy(true); setError(null); try { setStatus(await action()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') } finally { setBusy(false) } }
  const saveSettings = (event: FormEvent) => { event.preventDefault(); if (status) void run(() => saveGoogleSatelliteSettings(status.settings)) }
  return <section className="admin-console__card admin-console__setting-card" aria-labelledby="google-satellite-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><KeyRound size={17} /></span><div><h3 id="google-satellite-title">Google Satellite</h3><p>Activation globale et garde-fous. Chaque utilisateur configure sa propre clé Map Tiles dans son compte.</p></div><span className={`admin-console__setting-status ${status?.available ? 'ok' : 'warning'}`}>{status?.available ? 'Actif' : 'Inactif'}</span></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
      {status && <><dl className="admin-console__setting-metrics"><dt>Tuiles aujourd’hui</dt><dd>{status.usage.tiles_started_today.toLocaleString('fr-FR')} / {status.quota.daily_limit.toLocaleString('fr-FR')}</dd><dt>Tuiles ce mois</dt><dd>{status.usage.tiles_started_month.toLocaleString('fr-FR')} / {status.quota.monthly_limit.toLocaleString('fr-FR')}</dd><dt>Échecs aujourd’hui</dt><dd>{status.usage.tiles_failed_today.toLocaleString('fr-FR')}</dd><dt>Alerte locale</dt><dd>{status.warning_level ? `${status.warning_level} %` : 'Aucune'}</dd><dt>État</dt><dd>{status.quota.blocked ? 'Quota atteint' : status.settings.disabled_reason ?? 'Opérationnel'}</dd></dl>
      <form className="admin-console__setting-grid" onSubmit={saveSettings}><label className="admin-console__setting-check"><span>Activer Google Satellite</span><input type="checkbox" checked={status.settings.enabled} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, enabled: event.target.checked } })} /></label><label>Seuil journalier<input type="number" min="100" value={status.settings.daily_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, daily_soft_limit: Number(event.target.value) } })} /></label><label>Seuil mensuel<input type="number" min="100" value={status.settings.monthly_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, monthly_soft_limit: Number(event.target.value) } })} /></label><label>Désactivation à (%)<input type="number" min="50" max="200" value={status.settings.auto_disable_percent} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, auto_disable_percent: Number(event.target.value) } })} /></label><div className="admin-console__setting-actions"><button className="primary-button" disabled={busy}><Save size={16} />Enregistrer</button><button type="button" disabled={busy} onClick={() => void run(resetGoogleSatelliteErrors)}><RefreshCw size={16} />Réinitialiser les erreurs</button></div></form>
      <p className="admin-console__hint">Comptage autoritatif par le proxy CartaVault, sans URL, jeton ni coordonnées. Reset UTC : {status.quota.daily_reset_at} (jour), {status.quota.monthly_reset_at} (mois). <a href={status.authoritative_monitoring.console_url} target="_blank" rel="noreferrer">Comparer avec Google Cloud</a>. Alertes à 50 %, 80 % et 95 %.</p></>}
  </section>
}

/* Legacy quota overview removed: usage now belongs to Instance Status.
  const [overview, setOverview] = useState<QuotaOverview | null>(null); const [draft, setDraft] = useState<QuotaLimits | null>(null); const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserQuota | null>(null); const [overrideDraft, setOverrideDraft] = useState<QuotaLimits | null>(null)
  const load = useCallback((signal?: AbortSignal) => {
    setError(null)
    void getAdminQuotas(signal)
      .then((result) => { if (!signal?.aborted) { setOverview(result); setDraft(result.global_limits) } })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
  }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const save = async (event: FormEvent) => { event.preventDefault(); if (!draft) return; try { await saveAdminQuotas(draft); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } }
  const saveOverride = async (event: FormEvent) => { event.preventDefault(); if (!editing || !overrideDraft) return; try { await saveUserQuota(editing.user_id, overrideDraft); setEditing(null); setOverrideDraft(null); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.') } }
  return <section><SectionHeading eyebrow="Capacité" title="Quotas et usages" description="Limites globales, usages observables et exceptions utilisateur." />{error && <div className="form-alert" role="alert">{error}</div>}{!overview || !draft ? <p role="status">Chargement…</p> : <>
    <section className="admin-console__card"><h3>Limites globales</h3><form className="admin-console__quota-form" onSubmit={save}>{quotaFields.map(([key, label, unit]) => <label key={key}>{label}<span><input type="number" min="1" value={draft[key] ?? ''} placeholder="Illimité" onChange={(event) => setDraft({ ...draft, [key]: event.target.value ? Number(event.target.value) : null })} />{unit}</span></label>)}<button className="primary-button" data-cv-save="true"><Save size={16} />Enregistrer les limites</button></form><p className="admin-console__hint">Une limite vide signifie « illimité ». Aucun dépassement ne supprime automatiquement de données.</p></section>
    <section className="admin-console__metrics">{[['Cartes', overview.aggregate_usage.maps], ['Lieux', overview.aggregate_usage.places], ['Photos', overview.aggregate_usage.photos], ['Stockage photo', bytes(overview.aggregate_usage.photo_storage_bytes)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="admin-console__card"><h3>Usages par utilisateur</h3><div className="admin-console__table-wrap"><table><thead><tr><th>Utilisateur</th><th>Cartes</th><th>Lieux</th><th>Photos</th><th>Stockage</th><th>Exception</th></tr></thead><tbody>{overview.users.map((item) => <tr key={item.user_id}><td><strong>{item.display_name}</strong><small>{item.email}</small></td><td>{item.usage.maps}{limitText(item.limits.maps)}</td><td>{item.usage.places}{limitText(item.limits.places)}</td><td>{item.usage.photos}</td><td>{bytes(item.usage.photo_storage_bytes)}{limitText(item.limits.photo_storage_bytes, true)}</td><td><button type="button" onClick={() => { setEditing(item); setOverrideDraft(item.overrides) }}>Configurer</button></td></tr>)}</tbody></table></div><p className="admin-console__hint">Non disponibles sans journal d’usage : {overview.unavailable_metrics.join(', ')}.</p></section>
    {editing && overrideDraft && <section className="admin-console__card admin-console__override" aria-labelledby="quota-override-title"><h3 id="quota-override-title">Exceptions pour {editing.display_name}</h3><p>Une valeur vide hérite de la limite globale.</p><form className="admin-console__quota-form" onSubmit={saveOverride}>{quotaFields.map(([key, label, unit]) => <label key={key}>{label}<span><input type="number" min="1" value={overrideDraft[key] ?? ''} placeholder="Limite globale" onChange={(event) => setOverrideDraft({ ...overrideDraft, [key]: event.target.value ? Number(event.target.value) : null })} />{unit}</span></label>)}<div className="admin-console__actions"><button className="primary-button" data-cv-save="true" type="submit"><Save size={16} />Enregistrer</button><button type="button" onClick={() => { setEditing(null); setOverrideDraft(null) }}>Annuler</button></div></form></section>}
  </>}</section>
}

*/
