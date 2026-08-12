import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Check, ChevronLeft, ChevronRight, Gauge, ImageDown, KeyRound, RefreshCw, Save, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import {
  assignUserQuotaProfile, cancelBackgroundTask, getAdminUserActivity, getAdminUserDetails, getAdminUsers, getBackgroundTask, getMediaUploadSettings, getQuotaProfiles,
  getInstanceLogRetention, getSaasSettings, optimizeStoredMedia, saveInstanceLogRetention, saveMediaUploadSettings, saveSaasSettings,
  updateAdminUser,
} from '../../api/adminConsole'
import { accountAvatarUrl } from '../../api/account'
import { getGoogleSatelliteAdminStatus, resetGoogleSatelliteErrors, saveGoogleSatelliteSettings, type GoogleSatelliteAdminStatus } from '../../api/googleSatellite'
import { getPublicRegistrationSettings, getRegistrationRequests, reviewRegistration, updatePublicRegistrationSettings, type RegistrationRequest } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { InstanceStatusPage } from '../../features/admin/instance-status/InstanceStatusPage'
import { QuotaProfilesPage } from '../../features/admin/quotas/QuotaProfilesPage'
import { AdminUsersSection } from './AdminUsersSection'
import { AdminUserModal } from './AdminUserModal'
import { AdminApiKeysSection } from './AdminApiKeysSection'
import type { AdminRole, AdminUser, AdminUserActivity, AdminUserDetails, AdminUserPage, AdminUserState, QuotaProfile } from '../../types/adminConsole'

const sections = [
  ['users', Users, 'Utilisateurs'], ['general', Settings2, 'Général'], ['credentials', KeyRound, 'Clés API'],
  ['quotas', Gauge, 'Quotas'], ['instance', Activity, 'État de l’instance'],
] as const

type AdminSectionKey = typeof sections[number][0]
type AdminSaveEntry = { dirty: boolean; busy: boolean; save: () => Promise<void>; discard: () => void }
type AdminSaveContextValue = { register: (id: string, entry: AdminSaveEntry) => void; unregister: (id: string) => void }
const AdminSaveContext = createContext<AdminSaveContextValue | null>(null)

function useAdminSaveEntry(id: string, entry: AdminSaveEntry) {
  const context = useContext(AdminSaveContext)
  useEffect(() => {
    context?.register(id, entry)
    return () => context?.unregister(id)
  }, [context, entry, id])
}

export function AdminConsole({ onClose }: { onClose?: () => void } = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const modal = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [saveEntries, setSaveEntries] = useState<Record<string, AdminSaveEntry>>({})
  const [savingAll, setSavingAll] = useState(false)
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const activeSection = sections.find(([path]) => location.pathname === `/admin/${path}`)?.[0] ?? 'users'
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
    try { for (const entry of entries) await entry.save(); return true }
    catch { return false }
    finally { setSavingAll(false) }
  }, [saveEntries])
  useEffect(() => { setVisitedSections((current) => current.has(activeSection) ? current : new Set([...current, activeSection])) }, [activeSection])
  useEffect(() => { if (location.pathname === '/admin') navigate('/admin/users', { replace: true }) }, [location.pathname, navigate])
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
      <header className="admin-console__header"><div className="admin-console__header-icon"><ShieldCheck size={20} /></div><div><h2 id="admin-console-title">Administration</h2><p>Configuration et supervision de l’instance CartaVault.</p></div><div className="admin-console__header-actions"><button className="primary-button admin-console__save-all" type="button" disabled={!hasDirtyChanges || savingAll || dirtyEntries.some((entry) => entry.busy)} onClick={() => void saveAll()}><Save size={15} />{savingAll ? 'Enregistrement…' : 'Enregistrer'}</button><button ref={closeButton} className="panel-icon-button modal-header-close" type="button" aria-label="Fermer l’administration" onClick={requestClose}><X size={14} /></button></div></header>
      <nav className="admin-console__nav" aria-label="Sections d’administration">
        {sections.map(([path, Icon, label]) => <NavLink key={path} to={{ pathname: `/admin/${path}`, search: location.search }}><Icon size={18} /><span>{label}</span></NavLink>)}
      </nav>
      <AdminSaveContext.Provider value={saveContext}><div className="admin-console__content">
        {visitedSections.has('users') && <div hidden={activeSection !== 'users'}><AdminUsersSection /></div>}
        {visitedSections.has('general') && <div hidden={activeSection !== 'general'}><AdminGeneralSection /></div>}
        {visitedSections.has('credentials') && <div hidden={activeSection !== 'credentials'}><AdminApiKeysSection /></div>}
        {visitedSections.has('quotas') && <div hidden={activeSection !== 'quotas'}><QuotaProfilesPage /></div>}
        {visitedSections.has('instance') && <div hidden={activeSection !== 'instance'}><InstanceStatusPage /></div>}
      </div></AdminSaveContext.Provider>
      {closePromptOpen && <div className="cv-overlay admin-unsaved-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setClosePromptOpen(false) }}><section className="cv-modal admin-unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-unsaved-title"><header><div><p className="cv-workspace-panel__eyebrow">MODIFICATIONS</p><h2 id="admin-unsaved-title">Enregistrer ou Annuler les modifications</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer la confirmation" onClick={() => setClosePromptOpen(false)}><X size={16} /></button></header><p>Des modifications n’ont pas encore été enregistrées dans le panneau Administration.</p><footer><button className="secondary-button" type="button" onClick={() => setClosePromptOpen(false)}>Continuer l’édition</button><button className="danger-button" type="button" onClick={() => { dirtyEntries.forEach((entry) => entry.discard()); setClosePromptOpen(false); performClose() }}>Annuler les modifications</button><button className="primary-button" type="button" disabled={savingAll} onClick={() => void saveAll().then((saved) => { if (saved) { setClosePromptOpen(false); performClose() } })}><Save size={15} />Enregistrer</button></footer></section></div>}
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
  const { confirm, confirmationDialog } = useConfirmDialog()
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
  return <section><SectionHeading eyebrow="Instance" title="Général" description="Réglages généraux de l’instance et maintenance de la médiathèque." /><SaasSettingsPanel /><MediaMaintenancePanel /><LogRetentionPanel /></section>
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
  const saasSaveEntry = useMemo<AdminSaveEntry>(() => ({ dirty: enabled !== savedEnabled, busy, save, discard: () => setEnabled(savedEnabled) }), [busy, enabled, save, savedEnabled])
  useAdminSaveEntry('general-saas', saasSaveEntry)
  return <section className="admin-console__card admin-console__setting-card" aria-labelledby="saas-settings-title">
    <header className="admin-console__setting-header"><span className="admin-console__setting-icon"><ShieldCheck size={17} /></span><div><h3 id="saas-settings-title">Mode SaaS</h3><p>Active les fonctions destinées à une instance ouverte au public. Pour le moment, cela affiche le menu Contact aux utilisateurs.</p></div><label className="cv-toggle admin-console__setting-toggle"><input type="checkbox" role="switch" aria-label="Mode SaaS" checked={enabled} disabled={loading || busy} onChange={(event) => setEnabled(event.target.checked)} /><i aria-hidden="true" /><span>{enabled ? 'Actif' : 'Inactif'}</span></label></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
  </section>
}

function MediaMaintenancePanel() {
  const [limit, setLimit] = useState(5); const [maxDimension, setMaxDimension] = useState(2560); const [task, setTask] = useState<{ id: string; status: string; percent: number; message: string | null; result: Record<string, unknown> | null; error: string | null } | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const [savedSettings, setSavedSettings] = useState({ limit: 5, maxDimension: 2560 })
  const { confirm, confirmationDialog } = useConfirmDialog()
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
  const mediaSaveEntry = useMemo<AdminSaveEntry>(() => ({ dirty: limit !== savedSettings.limit || maxDimension !== savedSettings.maxDimension, busy, save, discard: () => { setLimit(savedSettings.limit); setMaxDimension(savedSettings.maxDimension) } }), [busy, limit, maxDimension, save, savedSettings])
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
  return <><section className="admin-console__card admin-console__setting-card" aria-labelledby="media-maintenance-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><ImageDown size={17} /></span><div><h3 id="media-maintenance-title">Médiathèque</h3><p>Limite d’import, résolution et optimisation contrôlée des images déjà stockées.</p></div></header>{error && <div className="form-alert" role="alert">{error}</div>}<form className="admin-console__setting-form" onSubmit={(event) => event.preventDefault()}><label>Taille maximale par image (Mo)<input type="number" min="1" max="100" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label><label>Résolution maximale (plus grand côté)<select value={maxDimension} onChange={(event) => setMaxDimension(Number(event.target.value))}><option value={1280}>1 280 px — Compact</option><option value={1920}>1 920 px — HD</option><option value={2560}>2 560 px — Standard</option><option value={3840}>3 840 px — Haute qualité</option></select></label><p className="admin-console__hint">Les images ne sont jamais agrandies. Ce réglage est appliqué aux nouveaux imports et lors de l’optimisation des médias existants.</p></form><div className="admin-console__setting-actions"><button type="button" className="primary-button" disabled={busy || !!active} onClick={() => void requestOptimize()}><ImageDown size={16} />Optimiser les médias existants</button>{active && <button type="button" className="danger" onClick={() => void cancel()}>Annuler</button>}</div>{task && <div className="admin-console__hint" role="status"><strong>{task.status === 'succeeded' ? 'Optimisation terminée' : task.status === 'failed' ? 'Optimisation en erreur' : task.status === 'cancelled' ? 'Optimisation annulée' : `${task.percent} %`}</strong><span>{task.message}</span>{task.result && <span> · {String(task.result.optimized ?? 0)} optimisé(s), {String(task.result.skipped ?? 0)} ignoré(s), {String(task.result.failed ?? 0)} erreur(s), {Math.round(Number(task.result.saved_bytes ?? 0) / 1024 / 1024 * 10) / 10} Mo libérés.</span>}{task.error && <span> · {task.error}</span>}</div>}</section>{confirmationDialog}</>
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
  const logsSaveEntry = useMemo<AdminSaveEntry>(() => ({ dirty: days !== savedDays, busy, save, discard: () => setDays(savedDays) }), [busy, days, save, savedDays])
  useAdminSaveEntry('general-logs', logsSaveEntry)
  return <section className="admin-console__card admin-console__setting-card" aria-labelledby="log-retention-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><Activity size={17} /></span><div><h3 id="log-retention-title">Journaux d’instance</h3><p>Les journaux applicatifs sont conservés en base puis nettoyés automatiquement après la durée choisie.</p></div></header>{error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="form-alert success" role="status">{notice}</div>}<form className="admin-console__setting-form" onSubmit={(event) => event.preventDefault()}><label>Durée de conservation (jours)<input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label></form><p className="admin-console__hint">Valeur par défaut : 7 jours. Les messages sont filtrés pour retirer les secrets et limiter les données personnelles.</p></section>
}

export function GoogleSatelliteAdminPanel() {
  const [status, setStatus] = useState<GoogleSatelliteAdminStatus | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const load = useCallback((signal?: AbortSignal) => { void getGoogleSatelliteAdminStatus(signal).then(setStatus).catch((reason) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement Google Satellite impossible.') }) }, [])
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])
  const run = async (action: () => Promise<GoogleSatelliteAdminStatus>) => { setBusy(true); setError(null); try { setStatus(await action()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération impossible.') } finally { setBusy(false) } }
  const saveSettings = (event: FormEvent) => { event.preventDefault(); if (status) void run(() => saveGoogleSatelliteSettings(status.settings)) }
  return <section className="admin-console__card admin-console__setting-card" aria-labelledby="google-satellite-title"><header className="admin-console__setting-header"><span className="admin-console__setting-icon"><KeyRound size={17} /></span><div><h3 id="google-satellite-title">Google Satellite</h3><p>Activation globale et garde-fous. Chaque utilisateur configure sa propre clé Map Tiles dans son compte.</p></div><span className={`admin-console__setting-status ${status?.available ? 'ok' : 'warning'}`}>{status?.available ? 'Actif' : 'Inactif'}</span></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
      {status && <><dl className="admin-console__setting-metrics"><dt>Tuiles aujourd’hui</dt><dd>{status.usage.tiles_started_today.toLocaleString('fr-FR')}</dd><dt>Tuiles ce mois</dt><dd>{status.usage.tiles_started_month.toLocaleString('fr-FR')}</dd><dt>Échecs aujourd’hui</dt><dd>{status.usage.tiles_failed_today.toLocaleString('fr-FR')}</dd><dt>Alerte locale</dt><dd>{status.warning_level ? `${status.warning_level} %` : 'Aucune'}</dd><dt>État</dt><dd>{status.settings.disabled_reason ?? 'Opérationnel'}</dd></dl>
      <form className="admin-console__setting-grid" onSubmit={saveSettings}><label className="admin-console__setting-check"><span>Activer Google Satellite</span><input type="checkbox" checked={status.settings.enabled} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, enabled: event.target.checked } })} /></label><label>Seuil journalier<input type="number" min="100" value={status.settings.daily_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, daily_soft_limit: Number(event.target.value) } })} /></label><label>Seuil mensuel<input type="number" min="100" value={status.settings.monthly_soft_limit} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, monthly_soft_limit: Number(event.target.value) } })} /></label><label>Désactivation à (%)<input type="number" min="50" max="200" value={status.settings.auto_disable_percent} onChange={(event) => setStatus({ ...status, settings: { ...status.settings, auto_disable_percent: Number(event.target.value) } })} /></label><div className="admin-console__setting-actions"><button className="primary-button" disabled={busy}><Save size={16} />Enregistrer</button><button type="button" disabled={busy} onClick={() => void run(resetGoogleSatelliteErrors)}><RefreshCw size={16} />Réinitialiser les erreurs</button></div></form>
      <p className="admin-console__hint">Estimations locales, sans URL, jeton ni coordonnées. <a href={status.authoritative_monitoring.console_url} target="_blank" rel="noreferrer">Ouvrir les métriques Google Cloud</a> pour la facturation autoritative. Alertes à 50 %, 80 % et 95 %.</p></>}
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
