import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Ellipsis, Globe2, History, LockKeyhole, Mail, MonitorSmartphone, MoreHorizontal, Search, Shield, ShieldCheck, SlidersHorizontal, UserRound, X } from 'lucide-react'

import { assignUserQuotaProfile, getAdminUserActivity, getAdminUserDetails, getAdminUsers, getQuotaProfiles, updateAdminUser } from '../../api/adminConsole'
import { accountAvatarUrl } from '../../api/account'
import { getPublicRegistrationSettings, updatePublicRegistrationSettings } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import type { AdminRole, AdminUser, AdminUserActivity, AdminUserDetails, AdminUserPage, AdminUserState, QuotaProfile } from '../../types/adminConsole'
import { AdminUserModal } from './AdminUserModal'

const roleLabel = (role: AdminRole) => role === 'admin' ? 'Administrateur' : 'Utilisateur'
const stateLabel = (state: AdminUserState) => state === 'active' ? 'Actif' : state === 'inactive' ? 'Suspendu' : 'Supprimé'

export function AdminUsersSection() {
  const [result, setResult] = useState<AdminUserPage | null>(null)
  const [profiles, setProfiles] = useState<QuotaProfile[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AdminRole | ''>('')
  const [state, setState] = useState<AdminUserState | ''>('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registration, setRegistration] = useState({ enabled: false, approval_required: true })
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null)
  const [selectedQuotaId, setSelectedQuotaId] = useState('')
  const [detailUser, setDetailUser] = useState<AdminUserDetails | null>(null)
  const [activityUser, setActivityUser] = useState<AdminUser | null>(null)
  const [activity, setActivity] = useState<AdminUserActivity[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const { confirm, confirmationDialog } = useConfirmDialog()

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    void Promise.all([getAdminUsers({ q: query.trim(), role, state, page }, signal), getQuotaProfiles(signal), getPublicRegistrationSettings(signal)])
      .then(([users, nextProfiles, nextRegistration]) => { if (!signal?.aborted) { setResult(users); setProfiles(nextProfiles); setRegistration(nextRegistration) } })
      .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (!signal?.aborted) setLoading(false) })
  }, [page, query, role, state])
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => load(controller.signal), 180); return () => { controller.abort(); window.clearTimeout(timer) } }, [load])

  const updateRegistration = async (patch: Partial<typeof registration>) => {
    try { setRegistration(await updatePublicRegistrationSettings({ ...registration, ...patch })) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') }
  }
  const updateUser = async (item: AdminUser, patch: { role?: AdminRole; is_active?: boolean }) => {
    try { await updateAdminUser(item.id, patch); setOpenMenu(null); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Modification impossible.') }
  }
  const saveQuota = async () => {
    if (!quotaUser || selectedQuotaId === quotaUser.quota_profile_id) { setQuotaUser(null); return }
    try { await assignUserQuotaProfile(quotaUser.id, selectedQuotaId); setQuotaUser(null); load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Affectation impossible.') }
  }
  const requestRoleChange = async (item: AdminUser, nextRole: AdminRole) => {
    const action = nextRole === 'admin' ? 'Promouvoir' : 'Rétrograder'
    if (!await confirm({ title: `${action} ${item.display_name}`, message: nextRole === 'admin' ? 'Cet utilisateur deviendra administrateur et pourra gérer l’instance.' : 'Cet utilisateur perdra ses droits d’administration.', confirmLabel: action, variant: 'positive' })) return
    await updateUser(item, { role: nextRole })
  }
  const openDetails = async (item: AdminUser) => {
    setOpenMenu(null); setModalLoading(true)
    try { setDetailUser(await getAdminUserDetails(item.id)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger la fiche utilisateur.') }
    finally { setModalLoading(false) }
  }
  const openActivity = async (item: AdminUser) => {
    setOpenMenu(null); setActivityUser(item); setModalLoading(true)
    try { setActivity(await getAdminUserActivity(item.id)) } catch (reason) { setActivityUser(null); setError(reason instanceof Error ? reason.message : 'Impossible de charger l’historique.') }
    finally { setModalLoading(false) }
  }
  const users = result?.items ?? []
  const active = users.filter((item) => item.state === 'active').length
  const mfaEnabled = 0

  return <section className="admin-users">
    <header className="admin-users__heading"><p>ACCÈS</p><h2>Utilisateurs</h2><span>Comptes, rôles et état d’accès à CartaVault.</span></header>
    {error && <div className="form-alert" role="alert">{error}</div>}
    <section className="admin-users__registration"><h3>Inscriptions publiques</h3><p>Autorisez les visiteurs à créer un compte sur cette instance.</p><div><Globe2 size={21} /><span><strong>Activer les inscriptions publiques</strong><small>Les visiteurs peuvent créer leur compte depuis la page d’inscription.</small></span><label className="cv-toggle"><input type="checkbox" role="switch" aria-label="Activer les inscriptions publiques" checked={registration.enabled} onChange={() => void updateRegistration({ enabled: !registration.enabled })} /><i /></label></div><div><Mail size={21} /><span><strong>Validation des demandes</strong><small>Les comptes confirmés par e-mail doivent être validés par un administrateur.</small></span><label className="cv-toggle"><input type="checkbox" role="switch" aria-label="Validation des demandes" disabled={!registration.enabled} checked={registration.approval_required} onChange={() => void updateRegistration({ approval_required: !registration.approval_required })} /><i /></label></div></section>
    <section className="admin-users__summary" aria-label="Résumé des utilisateurs"><div><ShieldCheck size={21} /><span><strong>Compte</strong><b><CircleCheck size={14} />{active} actif{active > 1 ? 's' : ''}</b></span></div><div><Mail size={21} /><span><strong>E-mail</strong><b><CircleCheck size={14} />{result?.total ?? 0} vérifié{(result?.total ?? 0) > 1 ? 's' : ''}</b></span></div><div><MonitorSmartphone size={21} /><span><strong>Sessions actives</strong><b><CircleCheck size={14} />{active}</b></span></div><div><LockKeyhole size={21} /><span><strong>Authentification MFA</strong><b className={mfaEnabled ? '' : 'warning'}>{mfaEnabled ? <><CircleCheck size={14} />{mfaEnabled} active{mfaEnabled > 1 ? 's' : ''}</> : 'Non activée'}</b></span></div></section>
    <section className="admin-users__accounts"><h3>Comptes</h3><div className="admin-users__filters"><label><span>Recherche</span><div><Search size={15} /><input type="search" placeholder="Rechercher par nom ou e-mail…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div></label><label>Rôle<select value={role} onChange={(event) => { setRole(event.target.value as AdminRole | ''); setPage(1) }}><option value="">Tous</option><option value="admin">Administrateurs</option><option value="user">Utilisateurs</option></select></label><label>État<select value={state} onChange={(event) => { setState(event.target.value as AdminUserState | ''); setPage(1) }}><option value="">Tous</option><option value="active">Actifs</option><option value="inactive">Suspendus</option><option value="deleted">Supprimés</option></select></label></div>
      {loading ? <p className="admin-users__empty">Chargement…</p> : users.length === 0 ? <p className="admin-users__empty">Aucun utilisateur trouvé.</p> : <ul>{users.map((item) => <li key={item.id}><div className="admin-users__avatar">{item.avatar_url ? <img src={accountAvatarUrl(item.avatar_url) ?? undefined} alt="" /> : item.display_name.slice(0, 1).toUpperCase()}</div><div className="admin-users__identity"><div><strong>{item.display_name}</strong><b className={item.state}>{stateLabel(item.state)}</b></div><small>{item.email}</small><p>{item.owned_map_count} carte{item.owned_map_count === 1 ? '' : 's'} <i /> {item.shared_map_count} partage{item.shared_map_count === 1 ? '' : 's'} <i /> {item.place_count} POI</p></div><div className="admin-users__role"><span>{item.role === 'admin' ? <Shield size={14} /> : <UserRound size={14} />}{roleLabel(item.role)}</span><small>Dernière connexion<br />{item.last_login_at ? new Date(item.last_login_at).toLocaleDateString('fr-FR') : 'Jamais'}</small></div><div className="admin-users__quota"><small>Quota</small><b>{item.quota_profile_name}</b></div><div className="admin-users__menu"><button className="panel-icon-button" type="button" aria-label={`Actions pour ${item.display_name}`} aria-expanded={openMenu === item.id} onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}><Ellipsis size={17} /></button>{openMenu === item.id && <div><button onClick={() => { setQuotaUser(item); setSelectedQuotaId(item.quota_profile_id); setOpenMenu(null) }}><SlidersHorizontal size={14} />Modifier le quota</button><button onClick={() => void requestRoleChange(item, 'admin')} disabled={item.role === 'admin'}>↑ Promouvoir</button><button onClick={() => void requestRoleChange(item, 'user')} disabled={item.role === 'user'}>↓ Rétrograder</button><button className="danger" onClick={() => void updateUser(item, { is_active: item.state !== 'active' })}>{item.state === 'active' ? <><X size={14} />Désactiver le compte</> : <><Check size={14} />Activer le compte</>}</button><hr /><button onClick={() => void openDetails(item)}><MoreHorizontal size={14} />Voir les détails</button><button onClick={() => void openActivity(item)}><History size={14} />Historique d’activité</button></div>}</div></li>)}</ul>}
      {result && <footer><button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} />Précédent</button><span>Page {result.page} sur {result.pages}</span><button disabled={page >= result.pages} onClick={() => setPage(page + 1)}>Suivant<ChevronRight size={15} /></button></footer>}</section>
    {quotaUser && <div className="cv-overlay admin-user-quota-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuotaUser(null) }}><section className="cv-modal admin-user-quota-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-quota-title"><header><div><p className="cv-workspace-panel__eyebrow">CAPACITÉ</p><h2 id="admin-user-quota-title">Modifier le quota</h2></div><button className="panel-icon-button" type="button" aria-label="Fermer" onClick={() => setQuotaUser(null)}><X size={16} /></button></header><p>Choisissez le profil de quota appliqué à <strong>{quotaUser.display_name}</strong>.</p><label>Profil de quota<select value={selectedQuotaId} onChange={(event) => setSelectedQuotaId(event.target.value)}>{profiles.filter((profile) => profile.is_active || profile.id === quotaUser.quota_profile_id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><footer><button className="secondary-button" type="button" onClick={() => setQuotaUser(null)}>Annuler</button><button className="primary-button" type="button" onClick={() => void saveQuota()}>Enregistrer</button></footer></section></div>}
    {(detailUser || activityUser || modalLoading) && <AdminUserModal detail={detailUser} activityUser={activityUser} activity={activity} loading={modalLoading} onClose={() => { setDetailUser(null); setActivityUser(null); setActivity([]) }} />}{confirmationDialog}
  </section>
}
