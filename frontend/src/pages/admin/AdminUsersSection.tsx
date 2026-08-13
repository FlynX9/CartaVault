import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Ellipsis, Globe2, History, LockKeyhole, Mail, MonitorSmartphone, MoreHorizontal, Search, Shield, ShieldCheck, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import { assignUserQuotaProfile, getAdminUserActivity, getAdminUserDetails, getAdminUsers, getQuotaProfiles, updateAdminUser } from '../../api/adminConsole'
import { accountAvatarUrl } from '../../api/account'
import { getPublicRegistrationSettings, updatePublicRegistrationSettings } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import type { AdminRole, AdminUser, AdminUserActivity, AdminUserDetails, AdminUserPage, AdminUserState, QuotaProfile } from '../../types/adminConsole'
import { AdminUserModal } from './AdminUserModal'

export function AdminUsersSection() {
  const { t, locale } = useI18n()
  const roleLabel = (value: AdminRole) => value === 'admin' ? t('admin.users.administrator') : t('admin.users.user')
  const stateLabel = (value: AdminUserState) => value === 'active' ? t('admin.users.activeSingular') : value === 'inactive' ? t('admin.users.suspendedSingular') : t('admin.users.deletedSingular')
  const [result, setResult] = useState<AdminUserPage | null>(null)
  const [profiles, setProfiles] = useState<QuotaProfile[]>([])
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AdminRole | ''>('')
  const [state, setState] = useState<AdminUserState | ''>('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
  useEffect(() => {
    if (!openMenu) return
    const closeFromOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.admin-users__menu')) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [openMenu])

  const updateRegistration = async (patch: Partial<typeof registration>) => {
    setError(null); setNotice(null)
    const success = 'enabled' in patch
      ? 'Modification des inscriptions publiques enregistrÃ©e.'
      : 'Modification de la validation des demandes dâ€™inscription enregistrÃ©e.'
    const failure = 'enabled' in patch
      ? 'Ã‰chec de la modification des inscriptions publiques.'
      : 'Ã‰chec de la modification de la validation des demandes dâ€™inscription.'
    try { setRegistration(await updatePublicRegistrationSettings({ ...registration, ...patch })); setNotice(success) } catch (reason) { setError(reason instanceof Error ? `${failure} ${reason.message}` : failure) }
  }
  const updateUser = async (item: AdminUser, patch: { role?: AdminRole; is_active?: boolean }) => {
    setError(null); setNotice(null)
    const action = patch.role ? `RÃ´le du compte Â« ${item.display_name} Â» modifiÃ©` : `Ã‰tat du compte Â« ${item.display_name} Â» modifiÃ©`
    try { await updateAdminUser(item.id, patch); setOpenMenu(null); load(); setNotice(`${action}.`) } catch (reason) { const failure = `Ã‰chec de la modification du compte Â« ${item.display_name} Â».`; setError(reason instanceof Error ? `${failure} ${reason.message}` : failure) }
  }
  const saveQuota = async () => {
    if (!quotaUser || selectedQuotaId === quotaUser.quota_profile_id) { setQuotaUser(null); return }
    setError(null); setNotice(null)
    const profile = profiles.find((item) => item.id === selectedQuotaId)
    try { await assignUserQuotaProfile(quotaUser.id, selectedQuotaId); setQuotaUser(null); load(); setNotice(`Profil de quota Â« ${profile?.name ?? selectedQuotaId} Â» affectÃ© Ã  Â« ${quotaUser.display_name} Â».`) } catch (reason) { const failure = `Ã‰chec de lâ€™affectation du quota Ã  Â« ${quotaUser.display_name} Â».`; setError(reason instanceof Error ? `${failure} ${reason.message}` : failure) }
  }
  const requestRoleChange = async (item: AdminUser, nextRole: AdminRole) => {
    const action = nextRole === 'admin' ? 'Promouvoir' : 'RÃ©trograder'
    if (!await confirm({ title: `${action} ${item.display_name}`, message: nextRole === 'admin' ? 'Cet utilisateur deviendra administrateur et pourra gÃ©rer lâ€™instance.' : 'Cet utilisateur perdra ses droits dâ€™administration.', confirmLabel: action, variant: 'positive', overlayClassName: 'admin-user-action-overlay' })) return
    await updateUser(item, { role: nextRole })
  }
  const openDetails = async (item: AdminUser) => {
    setOpenMenu(null); setModalLoading(true)
    try { setDetailUser(await getAdminUserDetails(item.id)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger la fiche utilisateur.') }
    finally { setModalLoading(false) }
  }
  const openActivity = async (item: AdminUser) => {
    setOpenMenu(null); setActivityUser(item); setModalLoading(true)
    try { setActivity(await getAdminUserActivity(item.id)) } catch (reason) { setActivityUser(null); setError(reason instanceof Error ? reason.message : 'Impossible de charger lâ€™historique.') }
    finally { setModalLoading(false) }
  }
  const users = result?.items ?? []
  const active = users.filter((item) => item.state === 'active').length
  const mfaEnabled = 0

  return <section className="admin-users">
    <header className="admin-users__heading"><p>{t('admin.users.eyebrow')}</p><h2>{t('admin.users.title')}</h2><span>{t('admin.users.description')}</span></header>
    {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
    <section className="admin-users__registration"><h3>{t('admin.users.publicRegistration')}</h3><p>{t('admin.users.publicRegistrationDescription')}</p><div><Globe2 size={21} /><span><strong>{t('admin.users.enableRegistration')}</strong><small>{t('admin.users.enableRegistrationHelp')}</small></span><label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.users.enableRegistration')} checked={registration.enabled} onChange={() => void updateRegistration({ enabled: !registration.enabled })} /><i /></label></div><div><Mail size={21} /><span><strong>{t('admin.users.approval')}</strong><small>{t('admin.users.approvalHelp')}</small></span><label className="cv-toggle"><input type="checkbox" role="switch" aria-label={t('admin.users.approval')} disabled={!registration.enabled} checked={registration.approval_required} onChange={() => void updateRegistration({ approval_required: !registration.approval_required })} /><i /></label></div></section>
    <section className="admin-users__summary" aria-label={t('admin.users.title')}><div><ShieldCheck size={21} /><span><strong>{t('admin.users.account')}</strong><b><CircleCheck size={14} />{active} {t('admin.users.activeSingular').toLowerCase()}</b></span></div><div><Mail size={21} /><span><strong>{t('admin.users.email')}</strong><b><CircleCheck size={14} />{result?.total ?? 0} {t('account.apiCatalog.verified').toLowerCase()}</b></span></div><div><MonitorSmartphone size={21} /><span><strong>{t('admin.users.activeSessions')}</strong><b><CircleCheck size={14} />{active}</b></span></div><div><LockKeyhole size={21} /><span><strong>{t('admin.users.mfa')}</strong><b className={mfaEnabled ? '' : 'warning'}>{mfaEnabled ? <><CircleCheck size={14} />{mfaEnabled} {t('admin.users.activeSingular').toLowerCase()}</> : t('admin.users.notEnabled')}</b></span></div></section>
    <section className="admin-users__accounts"><h3>{t('admin.users.accounts')}</h3><div className="admin-users__filters"><label><span>{t('admin.users.search')}</span><div><Search size={15} /><input type="search" placeholder={t('admin.users.searchPlaceholder')} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div></label><label>{t('admin.users.role')}<select value={role} onChange={(event) => { setRole(event.target.value as AdminRole | ''); setPage(1) }}><option value="">{t('admin.users.all')}</option><option value="admin">{t('admin.users.administrators')}</option><option value="user">{t('admin.users.users')}</option></select></label><label>{t('admin.users.state')}<select value={state} onChange={(event) => { setState(event.target.value as AdminUserState | ''); setPage(1) }}><option value="">{t('admin.users.all')}</option><option value="active">{t('admin.users.active')}</option><option value="inactive">{t('admin.users.suspended')}</option><option value="deleted">{t('admin.users.deleted')}</option></select></label></div>
      {loading ? <p className="admin-users__empty">{t('admin.users.loading')}</p> : users.length === 0 ? <p className="admin-users__empty">{t('admin.users.empty')}</p> : <ul>{users.map((item) => <li key={item.id}><div className="admin-users__avatar">{item.avatar_url ? <img src={accountAvatarUrl(item.avatar_url) ?? undefined} alt="" /> : item.display_name.slice(0, 1).toUpperCase()}</div><div className="admin-users__identity"><div><strong>{item.display_name}</strong><b className={item.state}>{stateLabel(item.state)}</b></div><small>{item.email}</small><p>{t(item.owned_map_count === 1 ? 'admin.users.maps_one' : 'admin.users.maps_other', { count: item.owned_map_count })} <i /> {t(item.shared_map_count === 1 ? 'admin.users.shares_one' : 'admin.users.shares_other', { count: item.shared_map_count })} <i /> {t('admin.users.places', { count: item.place_count })}</p></div><div className="admin-users__role"><span>{item.role === 'admin' ? <Shield size={14} /> : <UserRound size={14} />}{roleLabel(item.role)}</span><small>{t('admin.users.lastLogin')}<br />{item.last_login_at ? new Date(item.last_login_at).toLocaleDateString(locale) : t('admin.users.never')}</small></div><div className="admin-users__quota"><small>{t('admin.users.quota')}</small><b>{item.quota_profile_name}</b></div><div className="admin-users__menu"><button className="panel-icon-button" type="button" aria-label={t('admin.users.actionsFor', { name: item.display_name })} aria-expanded={openMenu === item.id} onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}><Ellipsis size={17} /></button>{openMenu === item.id && <div><button onClick={() => { setQuotaUser(item); setSelectedQuotaId(item.quota_profile_id); setOpenMenu(null) }}><SlidersHorizontal size={14} />{t('admin.users.editQuota')}</button><button onClick={() => void requestRoleChange(item, 'admin')} disabled={item.role === 'admin'}>â†‘ {t('admin.users.promote')}</button><button onClick={() => void requestRoleChange(item, 'user')} disabled={item.role === 'user'}>â†“ {t('admin.users.demote')}</button><button className="danger" onClick={() => void updateUser(item, { is_active: item.state !== 'active' })}>{item.state === 'active' ? <><X size={14} />{t('admin.users.disable')}</> : <><Check size={14} />{t('admin.users.enable')}</>}</button><hr /><button onClick={() => void openDetails(item)}><MoreHorizontal size={14} />{t('admin.users.details')}</button><button onClick={() => void openActivity(item)}><History size={14} />{t('admin.users.activity')}</button></div>}</div></li>)}</ul>}
      {result && <footer><button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} />{t('admin.users.previous')}</button><span>{t('admin.users.page', { page: result.page, pages: result.pages })}</span><button disabled={page >= result.pages} onClick={() => setPage(page + 1)}>{t('admin.users.next')}<ChevronRight size={15} /></button></footer>}</section>
    {quotaUser && createPortal(<div className="cv-overlay admin-user-quota-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuotaUser(null) }}><section className="cv-modal admin-user-quota-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-quota-title"><header><div><p className="cv-workspace-panel__eyebrow">{t('admin.users.capacity')}</p><h2 id="admin-user-quota-title">{t('admin.users.editQuotaTitle')}</h2></div><button className="panel-icon-button" type="button" aria-label={t('admin.users.close')} onClick={() => setQuotaUser(null)}><X size={16} /></button></header><p>{t('admin.users.editQuotaDescription', { name: quotaUser.display_name })}</p><label>{t('admin.users.quotaProfile')}<select value={selectedQuotaId} onChange={(event) => setSelectedQuotaId(event.target.value)}>{profiles.filter((profile) => profile.is_active || profile.id === quotaUser.quota_profile_id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><footer><button className="secondary-button" type="button" onClick={() => setQuotaUser(null)}>{t('admin.users.cancel')}</button><button className="primary-button" type="button" onClick={() => void saveQuota()}>{t('admin.save')}</button></footer></section></div>, document.body)}
    {(detailUser || activityUser || modalLoading) && <AdminUserModal detail={detailUser} activityUser={activityUser} activity={activity} loading={modalLoading} onClose={() => { setDetailUser(null); setActivityUser(null); setActivity([]) }} />}{confirmationDialog}
  </section>
}
