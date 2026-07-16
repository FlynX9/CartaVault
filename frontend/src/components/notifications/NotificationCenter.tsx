import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, MapPinned, X } from 'lucide-react'

import { acceptPendingMapInvitation, declinePendingMapInvitation, getPendingMapInvitations } from '../../api/maps'
import type { PendingMapInvitation } from '../../types/map'
import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged } from './events'

const REFRESH_INTERVAL_MS = 30_000
const TOAST_DURATION_MS = 7_000

interface NotificationCenterProps {
  userId: string
  onAccessChanged: () => void
}

const storageKey = (userId: string) => `cartavault:read-notifications:${userId}`

function storedReadIds(userId: string): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

export function NotificationCenter({ userId, onAccessChanged }: NotificationCenterProps) {
  const [invitations, setInvitations] = useState<PendingMapInvitation[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => storedReadIds(userId))
  const [toastInvitation, setToastInvitation] = useState<PendingMapInvitation | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const announcedIds = useRef<Set<string>>(new Set())
  const container = useRef<HTMLDivElement>(null)

  const load = useCallback((signal?: AbortSignal) => {
    void getPendingMapInvitations(signal).then((pending) => {
      setInvitations(pending)
      setError(null)
      const newlyReceived = pending.filter((item) => !announcedIds.current.has(item.id))
      pending.forEach((item) => announcedIds.current.add(item.id))
      if (newlyReceived.length > 0) setToastInvitation((current) => current ?? newlyReceived[0])
    }).catch((caught: unknown) => {
      if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les notifications.')
      }
    })
  }, [])

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
    if (toastInvitation === null) return
    const timer = window.setTimeout(() => setToastInvitation(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toastInvitation])

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

  const unreadCount = useMemo(() => invitations.filter((item) => !readIds.has(item.id)).length, [invitations, readIds])

  const markAllAsRead = () => {
    const next = new Set(readIds)
    invitations.forEach((item) => next.add(item.id))
    setReadIds(next)
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...next]))
  }

  const togglePanel = () => {
    setPanelOpen((current) => {
      if (!current) markAllAsRead()
      return !current
    })
  }

  const decide = async (invitation: PendingMapInvitation, decision: 'accept' | 'decline') => {
    if (busyId !== null) return
    setBusyId(invitation.id)
    setError(null)
    try {
      if (decision === 'accept') await acceptPendingMapInvitation(invitation.id)
      else await declinePendingMapInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setToastInvitation((current) => current?.id === invitation.id ? null : current)
      notifyNotificationsChanged()
      if (decision === 'accept') onAccessChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La réponse à la notification a échoué.')
    } finally {
      setBusyId(null)
    }
  }

  const actions = (invitation: PendingMapInvitation) => <div className="notification-actions">
    <button type="button" className="secondary-button" disabled={busyId !== null} onClick={() => void decide(invitation, 'decline')}>Refuser</button>
    <button type="button" className="primary-button" disabled={busyId !== null} onClick={() => void decide(invitation, 'accept')}><Check size={14} />Accepter</button>
  </div>

  return <div className="notification-center" ref={container}>
    <button type="button" className="notification-center__trigger panel-icon-button" aria-label={`Notifications, ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`} aria-expanded={panelOpen} onClick={togglePanel}>
      <Bell size={18} />
      {unreadCount > 0 && <span className="notification-center__badge" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    {panelOpen && <section className="notification-center__panel" aria-label="Centre de notifications">
      <header><div><p className="cv-workspace-panel__eyebrow">Activité</p><h2>Notifications</h2></div><span>{invitations.length}</span></header>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {invitations.length === 0 ? <p className="notification-center__empty">Aucune notification.</p> : <ul>{invitations.map((invitation) => <li key={invitation.id}>
        <MapPinned size={18} aria-hidden="true" />
        <div><p><strong>{invitation.invited_by_display_name}</strong> partage la carte <strong>{invitation.map_name}</strong> avec vous.</p><small>Accès {invitation.role === 'editor' ? 'éditeur' : 'lecteur'}</small>{actions(invitation)}</div>
      </li>)}</ul>}
    </section>}
    {toastInvitation && <aside className="notification-toast" role="status" aria-label="Nouvelle notification de partage">
      <button type="button" className="notification-toast__close" aria-label="Masquer la notification" onClick={() => setToastInvitation(null)}><X size={15} /></button>
      <MapPinned className="notification-toast__icon" size={20} aria-hidden="true" />
      <div><p><strong>{toastInvitation.invited_by_display_name}</strong> partage la carte <strong>{toastInvitation.map_name}</strong> avec vous.</p>{actions(toastInvitation)}</div>
    </aside>}
  </div>
}
