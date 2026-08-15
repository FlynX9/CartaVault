import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, CircleAlert, CircleCheck, Clock3, DownloadCloud, Info, MapPinned, ShieldAlert, UserRoundPlus, X } from 'lucide-react'

import { getTotpStatus } from '../../api/account'
import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import { getRegistrationRequests, type RegistrationRequest } from '../../api/registration'
import type { PendingMapInvitation } from '../../types/map'
import { OFFLINE_PROGRESS_CHANGED_EVENT, readOfflineProgress, type OfflineProgressItem } from '../../pwa/offlineProgress'
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from './events'
import { addNotificationHistory, NOTIFICATION_HISTORY_CHANGED_EVENT, readNotificationHistory, type NotificationHistoryEntry } from './history'
import { IMPORTANT_NOTIFICATIONS_CHANGED_EVENT, readImportantNotifications, type ImportantNotificationEntry } from './important'

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
  | { kind: 'mfa-disabled'; item: { id: 'mfa-disabled'; created_at: string } }
  | { kind: 'credential'; item: ImportantNotificationEntry }

const notificationId = (notification: NotificationItem) => `${notification.kind}:${notification.item.id}`
const notificationCreatedAt = (notification: NotificationItem) => 'created_at' in notification.item ? notification.item.created_at : notification.item.createdAt

export function NotificationCenter({ userId, isAdmin = false, onAccessChanged, onOpenRegistrationRequests }: NotificationCenterProps) {
  const [invitations, setInvitations] = useState<PendingMapInvitation[]>([])
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequest[]>([])
  const [mfaDisabled, setMfaDisabled] = useState(false)
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<NotificationHistoryEntry[]>(readNotificationHistory)
  const [importantCredentials, setImportantCredentials] = useState<ImportantNotificationEntry[]>(readImportantNotifications)
  const [offlineProgress, setOfflineProgress] = useState<OfflineProgressItem[]>(() => readOfflineProgress(userId))
  const announcedIds = useRef<Set<string>>(new Set())
  const container = useRef<HTMLDivElement>(null)
  const loadController = useRef<AbortController | null>(null)

  const notifications = useMemo<NotificationItem[]>(() => [
    ...(mfaDisabled ? [{ kind: 'mfa-disabled' as const, item: { id: 'mfa-disabled' as const, created_at: '9999-12-31T23:59:59' } }] : []),
    ...importantCredentials.map((item) => ({ kind: 'credential' as const, item })),
    ...registrationRequests.map((item) => ({ kind: 'registration' as const, item })),
    ...invitations.map((item) => ({ kind: 'invitation' as const, item })),
  ].sort((left, right) => notificationCreatedAt(right).localeCompare(notificationCreatedAt(left))), [importantCredentials, invitations, mfaDisabled, registrationRequests])

  const load = useCallback(() => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    const pendingRegistrations = isAdmin ? getRegistrationRequests(controller.signal) : Promise.resolve([])
    void Promise.all([getPendingMapInvitations(controller.signal), pendingRegistrations, getTotpStatus().catch(() => null)]).then(([pending, requests, totpStatus]) => {
      if (controller.signal.aborted) return
      const registrations = requests.filter((item) => item.status === 'pending')
      const received: NotificationItem[] = [
        ...registrations.map((item) => ({ kind: 'registration' as const, item })),
        ...pending.map((item) => ({ kind: 'invitation' as const, item })),
      ]
      setInvitations(pending)
      setRegistrationRequests(registrations)
      setMfaDisabled(totpStatus !== null && !totpStatus.enabled)
      setError(null)
      const newlyReceived = received.filter((item) => !announcedIds.current.has(notificationId(item)))
      received.forEach((item) => announcedIds.current.add(notificationId(item)))
      if (newlyReceived.length > 0) setToastNotification((current) => current ?? newlyReceived[0])
    }).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les notifications.')
      }
    }).finally(() => {
      if (loadController.current === controller) loadController.current = null
    })
  }, [isAdmin])

  useEffect(() => {
    load()
    const refreshVisible = () => { if (document.visibilityState === 'visible') load() }
    const interval = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      loadController.current?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [load])

  useEffect(() => {
    if (toastNotification === null) return
    if (toastNotification.kind === 'registration') {
      addNotificationHistory('information', `${toastNotification.item.display_name} demande à créer un compte avec ${toastNotification.item.email}.`)
    } else if (toastNotification.kind === 'invitation') {
      const ownershipTransfer = toastNotification.item.role === 'owner'
      addNotificationHistory('information', `${toastNotification.item.invited_by_display_name} ${ownershipTransfer ? 'vous propose la propriété de' : 'partage'} la carte ${toastNotification.item.map_name}${ownershipTransfer ? '.' : ' avec vous.'}`)
    }
    const timer = window.setTimeout(() => setToastNotification(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toastNotification])

  useEffect(() => {
    const updateHistory = () => setHistory(readNotificationHistory())
    window.addEventListener(NOTIFICATION_HISTORY_CHANGED_EVENT, updateHistory)
    window.addEventListener('storage', updateHistory)
    return () => {
      window.removeEventListener(NOTIFICATION_HISTORY_CHANGED_EVENT, updateHistory)
      window.removeEventListener('storage', updateHistory)
    }
  }, [])

  useEffect(() => {
    const updateImportantCredentials = () => setImportantCredentials(readImportantNotifications())
    window.addEventListener(IMPORTANT_NOTIFICATIONS_CHANGED_EVENT, updateImportantCredentials)
    window.addEventListener('storage', updateImportantCredentials)
    return () => {
      window.removeEventListener(IMPORTANT_NOTIFICATIONS_CHANGED_EVENT, updateImportantCredentials)
      window.removeEventListener('storage', updateImportantCredentials)
    }
  }, [])

  useEffect(() => {
    const updateOfflineProgress = () => setOfflineProgress(readOfflineProgress(userId))
    updateOfflineProgress()
    window.addEventListener(OFFLINE_PROGRESS_CHANGED_EVENT, updateOfflineProgress)
    return () => window.removeEventListener(OFFLINE_PROGRESS_CHANGED_EVENT, updateOfflineProgress)
  }, [userId])

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

  const togglePanel = () => {
    if (!panelOpen) setHistory(readNotificationHistory())
    setPanelOpen((current) => !current)
  }

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
    if (notification.kind === 'mfa-disabled') {
      return <><ShieldAlert className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><p><strong>Authentification à deux facteurs désactivée.</strong></p><small>Activez-la dans Options utilisateur → Sécurité pour mieux protéger votre compte.</small></div></>
    }
    if (notification.kind === 'registration') {
      const request = notification.item
      return <><UserRoundPlus className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><button type="button" className="notification-center__registration-link" onClick={() => openRegistrationRequests(request)}><p><strong>{request.display_name}</strong> demande à créer un compte avec <strong>{request.email}</strong>.</p><span className="secondary-button notification-center__review">Examiner la demande</span></button></div></>
    }
    if (notification.kind === 'credential') {
      return <><CircleAlert className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><p><strong>Clé API à vérifier.</strong></p><small>{notification.item.message}</small></div></>
    }
    const invitation = notification.item
    const ownershipTransfer = invitation.role === 'owner'
    return <><MapPinned className="notification-toast__icon" size={isToast ? 20 : 18} aria-hidden="true" /><div><p><strong>{invitation.invited_by_display_name}</strong> {ownershipTransfer ? 'vous propose la propriété de' : 'partage'} la carte <strong>{invitation.map_name}</strong>{ownershipTransfer ? '.' : ' avec vous.'}</p><small>{ownershipTransfer ? 'Transfert de propriété' : `Accès ${invitation.role === 'editor' ? 'éditeur' : 'lecteur'}`}</small>{invitationActions(invitation)}</div></>
  }

  const historyIcon = (kind: NotificationHistoryEntry['kind']) => {
    if (kind === 'success') return <CircleCheck size={17} aria-hidden="true" />
    if (kind === 'error') return <CircleAlert size={17} aria-hidden="true" />
    return <Info size={17} aria-hidden="true" />
  }

  const historyDate = (createdAt: string) => new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(createdAt))

  return <div className="notification-center" ref={container}>
    <button type="button" className="notification-center__trigger panel-icon-button" aria-label={`Notifications, ${pendingCount} en attente`} aria-expanded={panelOpen} onClick={togglePanel}>
      <Bell size={18} />
      {pendingCount > 0 && <span className="notification-center__badge" aria-hidden="true">{pendingCount > 9 ? '9+' : pendingCount}</span>}
    </button>
    {panelOpen && <section className="notification-center__panel" aria-label="Centre de notifications">
      <header><div><p className="cv-workspace-panel__eyebrow">Activité</p><h2>Notifications</h2></div><span>{notifications.length}</span></header>
      {error && <p className="form-alert" role="alert">{error}</p>}
      <div className="notification-center__section">
        <h3><span>Notifications importantes</span><small>{notifications.length}</small></h3>
        {notifications.length === 0 ? <p className="notification-center__empty">Aucune notification.</p> : <ul>{notifications.map((notification) => <li key={notificationId(notification)} className={`notification-center__item notification-center__item--${notification.kind}`}>
          {notificationContent(notification)}
        </li>)}</ul>}
      </div>
      {offlineProgress.length > 0 && <div className="notification-center__section notification-center__offline" aria-label="Téléchargements hors ligne">
        <h3><span>Mise hors ligne</span><small>{offlineProgress.length}</small></h3>
        <ul>{offlineProgress.map((item) => <li key={item.id} className={`notification-center__offline-item is-${item.status}`}>
          <DownloadCloud size={18} aria-hidden="true" />
          <div>
            <p><strong>{item.title}</strong><span>{item.status === 'complete' ? 'Disponible hors ligne' : item.status === 'error' ? 'Échec du téléchargement' : item.status === 'paused' ? 'En attente de connexion' : item.phase === 'basemap' ? item.reused > 0 && item.bytes === 0 ? 'Réutilisation de la carte' : 'Téléchargement de la carte' : item.phase === 'saving' ? 'Enregistrement' : 'Téléchargement des données'}</span></p>
            <div className="notification-center__offline-progress" role="progressbar" aria-label={`Mise hors ligne de ${item.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><i style={{ width: `${item.percent}%` }} /></div>
            <small>{item.status === 'error' ? item.error : `${item.percent} %${item.bytes > 0 ? ` · ${Math.round(item.bytes / 1024 / 1024)} Mo téléchargés` : ''}${item.reused > 0 ? ` · ${item.reused.toLocaleString('fr-FR')} tuiles réutilisées` : ''}`}</small>
          </div>
        </li>)}</ul>
      </div>}
      <div className="notification-center__section notification-center__history">
        <h3><span>Historique</span><small>{history.length}</small></h3>
        {history.length === 0 ? <p className="notification-center__empty">Aucune notification dans l’historique.</p> : <ul>{history.map((entry) => <li key={entry.id} className={`notification-center__history-item is-${entry.kind}`}>
          {historyIcon(entry.kind)}
          <div><p>{entry.message}</p><small><Clock3 size={12} aria-hidden="true" />{historyDate(entry.createdAt)}</small></div>
        </li>)}</ul>}
      </div>
    </section>}
    {toastNotification && <aside className="notification-toast" role="status" aria-label={toastNotification.kind === 'registration' ? 'Nouvelle demande d’inscription' : 'Nouvelle notification de partage'}>
      <button type="button" className="notification-toast__close" aria-label="Masquer la notification" onClick={() => setToastNotification(null)}><X size={15} /></button>
      {notificationContent(toastNotification, true)}
    </aside>}
  </div>
}
