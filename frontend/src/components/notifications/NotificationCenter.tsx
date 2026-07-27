import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, MapPinned, UserRoundPlus, X } from 'lucide-react'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import { getRegistrationRequests, type RegistrationRequest } from '../../api/registration'
import type { PendingMapInvitation } from '../../types/map'
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from './events'

const REFRESH_INTERVAL_MS = 30_000
const TOAST_DURATION_MS = 7_000

interface NotificationCenterProps {
  userId: string
  isAdmin?: boolean
  onAccessChanged: () => void
  onOpenRegistrationRequests?: () => void
}

type NotificationItem =
  | { kind: 'invitation'; item: PendingMapInvitation }
  | { kind: 'registration'; item: RegistrationRequest }

const notificationId = (notification: NotificationItem) => `${notification.kind}:${notification.item.id}`

export function NotificationCenter({ isAdmin = false, onAccessChanged, onOpenRegistrationRequests }: NotificationCenterProps) {
  const [invitations, setInvitations] = useState<PendingMapInvitation[]>([])
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequest[]>([])
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const announcedIds = useRef<Set<string>>(new Set())
  const container = useRef<HTMLDivElement>(null)

  const notifications = useMemo<NotificationItem[]>(() => [
    ...registrationRequests.map((item) => ({ kind: 'registration' as const, item })),
    ...invitations.map((item) => ({ kind: 'invitation' as const, item })),
  ].sort((left, right) => right.item.created_at.localeCompare(left.item.created_at)), [invitations, registrationRequests])

  const load = useCallback((signal?: AbortSignal) => {
    const pendingRegistrations = isAdmin ? getRegistrationRequests(signal) : Promise.resolve([])
    void Promise.all([getPendingMapInvitations(signal), pendingRegistrations]).then(([pending, requests]) => {
      if (signal?.aborted) return
      const registrations = requests.filter((item) => item.status === 'pending')
      const received: NotificationItem[] = [
        ...registrations.map((item) => ({ kind: 'registration' as const, item })),
        ...pending.map((item) => ({ kind: 'invitation' as const, item })),
      ]
      setInvitations(pending)
      setRegistrationRequests(registrations)
      setError(null)
      const newlyReceived = received.filter((item) => !announcedIds.current.has(notificationId(item)))
      received.forEach((item) => announcedIds.current.add(notificationId(item)))
      if (newlyReceived.length > 0) setToastNotification((current) => current ?? newlyReceived[0])
    }).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les notifications.')
      }
    })
  }, [isAdmin])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    const refreshVisible = () => { if (document.visibilityState === 'visible') load() }
    const interval = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [load])

  useEffect(() => {
    if (toastNotification === null) return
    const timer = window.setTimeout(() => setToastNotification(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toastNotification])

  useEffect(() => {
    if (!panelOpen) return
    const closeOnMouseDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setPanelOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false)
    }
    document.addEventListener('mousedown', closeOnMouseDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnMouseDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [panelOpen])

  const pendingCount = notifications.length

  const togglePanel = () => setPanelOpen((current) => !current)

  const decide = async (invitation: PendingMapInvitation, decision: 'accept' | 'decline') => {
    if (busyId !== null) return
    setBusyId(invitation.id)
    setError(null)
    try {
      if (decision === 'accept') await acceptPendingMapInvitation(invitation.id)
      else await declinePendingMapInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setToastNotification((current) => current?.kind === 'invitation' && current.item.id === invitation.id ? null : current)
      notifyNotificationsChanged()
      if (decision === 'accept') onAccessChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La réponse à la notification a échoué.')
    } finally {
      setBusyId(null)
    }
  }

  const openRegistrationRequests = (request: RegistrationRequest) => {
    setToastNotification((current) => current?.kind === 'registration' && current.item.id === request.id ? null : current)
    setPanelOpen(false)
    onOpenRegistrationRequests?.()
  }

  const invitationActions = (invitation: PendingMapInvitation) => <div className="notification-actions">
    <button type="button" className="secondary-button" disabled={busyId !== null} onClick={() => void decide(invitation, 'decline')}>Refuser</button>
    <button type="button" className="primary-button" disabled={busyId !== null} onClick={() => void decide(invitation, 'accept')}><Check size={14} />Accepter</button>
  </div>

  const notificationContent = (notification: NotificationItem, isToast = false) => {
    if (notification.kind === 'registration') {
      const request = notification.item
      return <><UserRoundPlus className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><button type="button" className="notification-center__registration-link" onClick={() => openRegistrationRequests(request)}><p><strong>{request.display_name}</strong> demande à créer un compte avec <strong>{request.email}</strong>.</p><span className="secondary-button notification-center__review">Examiner la demande</span></button></div></>
    }
    const invitation = notification.item
    return <><MapPinned className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><p><strong>{invitation.invited_by_display_name}</strong> partage la carte <strong>{invitation.map_name}</strong> avec vous.</p><small>Accès {invitation.role === 'editor' ? 'éditeur' : 'lecteur'}</small>{invitationActions(invitation)}</div></>
  }

  return <div className="notification-center" ref={container}>
    <button type="button" className="notification-center__trigger panel-icon-button" aria-label={`Notifications, ${pendingCount} en attente`} aria-expanded={panelOpen} onClick={togglePanel}>
      <Bell size={18} />
      {pendingCount > 0 && <span className="notification-center__badge" aria-hidden="true">{pendingCount > 9 ? '9+' : pendingCount}</span>}
    </button>
    {panelOpen && <section className="notification-center__panel" aria-label="Centre de notifications">
      <header><div><p className="cv-workspace-panel__eyebrow">Activité</p><h2>Notifications</h2></div><span>{notifications.length}</span></header>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notifications.length === 0 ? <p className="notification-center__empty">Aucune notification.</p> : <ul>{notifications.map((notification) => <li key={notificationId(notification)} className={`notification-center__item notification-center__item--${notification.kind}`}>
        {notificationContent(notification)}
      </li>)}</ul>}
    </section>}
    {toastNotification && <aside className="notification-toast" role="status" aria-label={toastNotification.kind === 'registration' ? 'Nouvelle demande d’inscription' : 'Nouvelle notification de partage'}>
      <button type="button" className="notification-toast__close" aria-label="Masquer la notification" onClick={() => setToastNotification(null)}><X size={15} /></button>
      {notificationContent(toastNotification, true)}
    </aside>}
  </div>
}
