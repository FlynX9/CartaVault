import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Ellipsis, History, Map, MapPin, MoreHorizontal, Search, Shield, ShieldCheck, SlidersHorizontal, UserRound, UserRoundPlus, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'

import { assignUserQuotaProfile, getAdminUserActivity, getAdminUserDetails, getAdminUsers, getQuotaProfiles, updateAdminUser } from '../../api/adminConsole'
import { accountAvatarUrl } from '../../api/account'
import { getRegistrationRequests, reviewRegistration, type RegistrationRequest } from '../../api/registration'
import { useConfirmDialog } from '../../components/common/useConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import type { AdminRole, AdminUser, AdminUserActivity, AdminUserDetails, AdminUserPage, AdminUserState, QuotaProfile } from '../../types/adminConsole'
import { AdminUserModal } from './AdminUserModal'

export function AdminUsersSection() {
  const { t, locale } = useI18n()
  const location = useLocation()
  const registrationHeading = useRef<HTMLHeadingElement>(null)
  const roleLabel = (value: AdminRole) => value === 'admin' ? t('admin.users.administrator') : t('admin.users.user')
  const stateLabel = (value: AdminUserState) => value === 'active' ? t('admin.users.activeSingular') : value === 'inactive' ? t('admin.users.suspendedSingular') : t('admin.users.deletedSingular')
  const [result, setResult] = useState<AdminUserPage | null>(null)
  const [profiles, setProfiles] = useState<QuotaProfile[]>([])
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequest[]>([])
  const [approvalProfiles, setApprovalProfiles] = useState<Record<string, string>>({})
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<AdminRole | ''>('')
  const [state, setState] = useState<AdminUserState | ''>('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
    void Promise.all([getAdminUsers({ q: query.trim(), role, state, page }, signal), getQuotaProfiles(signal), getRegistrationRequests(signal)])
      .then(([users, nextProfiles, requests]) => {
        if (signal?.aborted) return
        setResult(users)
        setProfiles(nextProfiles)
        setRegistrationRequests(requests)
        const fallbackProfile = nextProfiles.find((profile) => profile.is_active && profile.is_default) ?? nextProfiles.find((profile) => profile.is_active)
        if (fallbackProfile) {
          setApprovalProfiles((current) => Object.fromEntries(requests.map((request) => [request.id, current[request.id] ?? fallbackProfile.id])))
        }
      })
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
  const reviewRequest = async (request: RegistrationRequest, decision: 'approve' | 'reject') => {
    const quotaProfileId = approvalProfiles[request.id]
    if (decision === 'approve' && !quotaProfileId) {
      setError(t('admin.users.registrationQuotaRequired'))
      return
    }
    if (decision === 'reject' && !await confirm({
      title: t('admin.users.rejectRegistrationTitle'),
      message: t('admin.users.rejectRegistrationDescription', { name: request.display_name }),
      confirmLabel: t('admin.users.reject'),
      variant: 'danger',
      overlayClassName: 'admin-user-action-overlay',
    })) return
    setError(null); setNotice(null); setReviewingRequestId(request.id)
    try {
      await reviewRegistration(request.id, decision, quotaProfileId)
      setRegistrationRequests((current) => current.filter((item) => item.id !== request.id))
      setApprovalProfiles((current) => { const next = { ...current }; delete next[request.id]; return next })
      if (decision === 'approve') load()
      setNotice(t(decision === 'approve' ? 'admin.users.registrationApproved' : 'admin.users.registrationRejected', { name: request.display_name }))
    } catch (reason) {
      const failure = t('admin.users.registrationReviewFailed')
      setError(reason instanceof Error ? `${failure} ${reason.message}` : failure)
    } finally { setReviewingRequestId(null) }
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
  const summary = result?.summary
  const pendingRequests = registrationRequests.filter((request) => request.status === 'pending')
  useEffect(() => {
    if (new URLSearchParams(location.search).get('admin_notification') !== 'registration-requests' || pendingRequests.length === 0) return
    const frame = window.requestAnimationFrame(() => {
      registrationHeading.current?.scrollIntoView({ block: 'nearest' })
      registrationHeading.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.search, pendingRequests.length])

  return <section className="admin-users">
    <header className="admin-users__heading"><p>{t('admin.users.eyebrow')}</p><h2>{t('admin.users.title')}</h2><span>{t('admin.users.description')}</span></header>
    {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
    {pendingRequests.length > 0 && <section className="admin-users__registrations" aria-labelledby="registration-requests-title">
      <header><span><UserRoundPlus size={19} aria-hidden="true" /></span><div><h3 id="registration-requests-title" ref={registrationHeading} tabIndex={-1}>{t('admin.users.pendingRegistrations')}</h3><p>{t('admin.users.pendingRegistrationsHelp')}</p></div><b>{pendingRequests.length}</b></header>
      <ul>{pendingRequests.map((request) => {
        const busy = reviewingRequestId === request.id
        return <li key={request.id}><div className="admin-users__registration-identity"><strong>{request.display_name}</strong><small>{request.email}</small><time dateTime={request.created_at}>{t('admin.users.requestedOn', { date: new Date(request.created_at).toLocaleDateString(locale) })}</time></div><label>{t('admin.users.quotaProfile')}<select aria-label={t('admin.users.registrationQuotaFor', { email: request.email })} value={approvalProfiles[request.id] ?? ''} disabled={busy} onChange={(event) => setApprovalProfiles((current) => ({ ...current, [request.id]: event.target.value }))}><option value="" disabled>{t('admin.users.chooseQuota')}</option>{profiles.filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_default ? ` · ${t('admin.users.defaultQuota')}` : ''}</option>)}</select></label><div className="admin-users__registration-actions"><button className="secondary-button danger" type="button" disabled={busy} onClick={() => void reviewRequest(request, 'reject')}><X size={14} />{t('admin.users.reject')}</button><button className="primary-button" type="button" disabled={busy || !approvalProfiles[request.id]} onClick={() => void reviewRequest(request, 'approve')}><Check size={14} />{busy ? t('admin.users.reviewing') : t('admin.users.approve')}</button></div></li>
      })}</ul>
    </section>}
    <section className="admin-users__summary" aria-label={t('admin.users.title')}><div><ShieldCheck size={21} /><span><strong>{t('admin.users.activeAccounts')}</strong><b><CircleCheck size={14} />{summary?.active_users ?? 0}</b></span></div><div><Shield size={21} /><span><strong>{t('admin.users.administrators')}</strong><b>{summary?.administrators ?? 0}</b></span></div><div><Map size={21} /><span><strong>{t('admin.users.maps')}</strong><b>{summary?.maps ?? 0}</b></span></div><div><MapPin size={21} /><span><strong>{t('admin.users.pointsOfInterest')}</strong><b>{summary?.places ?? 0}</b></span></div></section>
    <section className="admin-users__accounts"><h3>{t('admin.users.accounts')}</h3><div className="admin-users__filters"><label><span>{t('admin.users.search')}</span><div><Search size={15} /><input type="search" placeholder={t('admin.users.searchPlaceholder')} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div></label><label>{t('admin.users.role')}<select value={role} onChange={(event) => { setRole(event.target.value as AdminRole | ''); setPage(1) }}><option value="">{t('admin.users.all')}</option><option value="admin">{t('admin.users.administrators')}</option><option value="user">{t('admin.users.users')}</option></select></label><label>{t('admin.users.state')}<select value={state} onChange={(event) => { setState(event.target.value as AdminUserState | ''); setPage(1) }}><option value="">{t('admin.users.all')}</option><option value="active">{t('admin.users.active')}</option><option value="inactive">{t('admin.users.suspended')}</option><option value="deleted">{t('admin.users.deleted')}</option></select></label></div>
      {loading ? <p className="admin-users__empty">{t('admin.users.loading')}</p> : users.length === 0 ? <p className="admin-users__empty">{t('admin.users.empty')}</p> : <ul>{users.map((item) => <li key={item.id}><div className="admin-users__avatar">{item.avatar_url ? <img src={accountAvatarUrl(item.avatar_url) ?? undefined} alt="" /> : item.display_name.slice(0, 1).toUpperCase()}</div><div className="admin-users__identity"><div><strong>{item.display_name}</strong><b className={item.state}>{stateLabel(item.state)}</b></div><small>{item.email}</small><p>{t(item.owned_map_count === 1 ? 'admin.users.maps_one' : 'admin.users.maps_other', { count: item.owned_map_count })} <i /> {t(item.shared_map_count === 1 ? 'admin.users.shares_one' : 'admin.users.shares_other', { count: item.shared_map_count })} <i /> {t('admin.users.places', { count: item.place_count })}</p></div><div className="admin-users__role"><span>{item.role === 'admin' ? <Shield size={14} /> : <UserRound size={14} />}{roleLabel(item.role)}</span><small>{t('admin.users.lastLogin')}<br />{item.last_login_at ? new Date(item.last_login_at).toLocaleDateString(locale) : t('admin.users.never')}</small></div><div className="admin-users__quota"><small>{t('admin.users.quota')}</small><b>{item.quota_profile_name}</b></div><div className="admin-users__menu"><button className="panel-icon-button" type="button" aria-label={t('admin.users.actionsFor', { name: item.display_name })} aria-expanded={openMenu === item.id} onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}><Ellipsis size={17} /></button>{openMenu === item.id && <div><button onClick={() => { setQuotaUser(item); setSelectedQuotaId(item.quota_profile_id); setOpenMenu(null) }}><SlidersHorizontal size={14} />{t('admin.users.editQuota')}</button><button onClick={() => void requestRoleChange(item, 'admin')} disabled={item.role === 'admin'}>â†‘ {t('admin.users.promote')}</button><button onClick={() => void requestRoleChange(item, 'user')} disabled={item.role === 'user'}>â†“ {t('admin.users.demote')}</button><button className="danger" onClick={() => void updateUser(item, { is_active: item.state !== 'active' })}>{item.state === 'active' ? <><X size={14} />{t('admin.users.disable')}</> : <><Check size={14} />{t('admin.users.enable')}</>}</button><hr /><button onClick={() => void openDetails(item)}><MoreHorizontal size={14} />{t('admin.users.details')}</button><button onClick={() => void openActivity(item)}><History size={14} />{t('admin.users.activity')}</button></div>}</div></li>)}</ul>}
      {result && <footer><button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} />{t('admin.users.previous')}</button><span>{t('admin.users.page', { page: result.page, pages: result.pages })}</span><button disabled={page >= result.pages} onClick={() => setPage(page + 1)}>{t('admin.users.next')}<ChevronRight size={15} /></button></footer>}</section>
    {quotaUser && createPortal(<div className="cv-overlay admin-user-quota-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuotaUser(null) }}><section className="cv-modal admin-user-quota-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-user-quota-title"><header><div><p className="cv-workspace-panel__eyebrow">{t('admin.users.capacity')}</p><h2 id="admin-user-quota-title">{t('admin.users.editQuotaTitle')}</h2></div><button className="panel-icon-button" type="button" aria-label={t('admin.users.close')} onClick={() => setQuotaUser(null)}><X size={16} /></button></header><p>{t('admin.users.editQuotaDescription', { name: quotaUser.display_name })}</p><label>{t('admin.users.quotaProfile')}<select value={selectedQuotaId} onChange={(event) => setSelectedQuotaId(event.target.value)}>{profiles.filter((profile) => profile.is_active || profile.id === quotaUser.quota_profile_id).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><footer><button className="secondary-button" type="button" onClick={() => setQuotaUser(null)}>{t('admin.users.cancel')}</button><button className="primary-button" type="button" onClick={() => void saveQuota()}>{t('admin.save')}</button></footer></section></div>, document.body)}
    {(detailUser || activityUser || modalLoading) && <AdminUserModal detail={detailUser} activityUser={activityUser} activity={activity} loading={modalLoading} onClose={() => { setDetailUser(null); setActivityUser(null); setActivity([]) }} />}{confirmationDialog}
  </section>
}
