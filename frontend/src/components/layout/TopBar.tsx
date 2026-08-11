import { useEffect, useRef, useState } from 'react'
import { Braces, ChevronDown, Lock, LockOpen, LogOut, Mail, Moon, PanelsTopLeft, Settings2, ShieldCheck, Sun, UserRound, WifiOff } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { accountAvatarUrl } from '../../api/account'
import { getSaasStatus } from '../../api/contact'
import { useAuth } from '../../auth/useAuth'
import { API_BASE_URL } from '../../config'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { AccountModal } from '../account/AccountModal'
import { ContactModal } from '../contact/ContactModal'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { ActionHistoryControls } from './ActionHistoryControls'
import { clearActionHistory } from '../../ui/actionHistory'
import { DESKTOP_PANEL_LAYOUT_MODE_EVENT, readPanelLayoutMode, RESET_DESKTOP_PANEL_LAYOUT_EVENT } from './FloatingPanelWindow'

interface TopBarProps {
  isMapWorkspace: boolean
  panelLayoutScope?: string
  contextLabel?: string
  markerCount: number
  onMapAccessChanged: () => void
  onOpenAdmin: () => void
  onOpenRegistrationRequests: () => void
}

const API_DOCUMENTATION_URL = /^https?:\/\//.test(API_BASE_URL)
  ? `${API_BASE_URL}/docs`
  : new URL(`${API_BASE_URL}/docs`, window.location.origin).toString()
const CARTAVAULT_VERSION = import.meta.env.VITE_CARTAVAULT_VERSION?.trim() || 'development'

export function TopBar({ isMapWorkspace, panelLayoutScope = 'map', contextLabel, markerCount, onMapAccessChanged, onOpenAdmin, onOpenRegistrationRequests }: TopBarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [saasEnabled, setSaasEnabled] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [defaultPanelLayoutLocked, setDefaultPanelLayoutLocked] = useState(() => readPanelLayoutMode(panelLayoutScope, true) === 'default')
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const avatar = accountAvatarUrl(user?.avatar_url ?? null)
  const nextThemeLabel = resolvedTheme === 'dark' ? t('auth.theme.light') : t('auth.theme.dark')
  const closeAdminForAccount = () => {
    if (!location.pathname.startsWith('/admin')) return
    navigate({ pathname: '/', search: location.search })
  }
  const handleLogout = async () => {
    setMenuOpen(false)
    try {
      await logout()
    } catch {
      // The local session is cleared by AuthProvider even if the server is unavailable.
    } finally {
      clearActionHistory()
      navigate('/login', { replace: true })
    }
  }

  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    setDefaultPanelLayoutLocked(readPanelLayoutMode(panelLayoutScope) === 'default')
    const updatePanelLayoutMode = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: 'default' | 'custom'; scope?: string }>).detail
      if (!detail.scope || detail.scope === panelLayoutScope) setDefaultPanelLayoutLocked(detail.mode === 'default')
    }
    window.addEventListener(DESKTOP_PANEL_LAYOUT_MODE_EVENT, updatePanelLayoutMode)
    return () => window.removeEventListener(DESKTOP_PANEL_LAYOUT_MODE_EVENT, updatePanelLayoutMode)
  }, [panelLayoutScope])

  useEffect(() => {
    if (!location.pathname.startsWith('/admin')) return
    setMenuOpen(false)
    setAccountOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!user) { setSaasEnabled(false); return }
    const controller = new AbortController()
    void getSaasStatus(controller.signal).then((value) => { if (!controller.signal.aborted) setSaasEnabled(value.enabled) }).catch(() => { if (!controller.signal.aborted) setSaasEnabled(false) })
    return () => controller.abort()
  }, [user?.id])

  return (
    <header className="app-header">
      <div className="brand-block">
        <p className="app-eyebrow">{contextLabel ?? (isMapWorkspace ? t('app.workspace') : t('app.administration'))}</p>
        <h1 className="cartavault-wordmark"><span>Carta</span><strong>Vault</strong><small title={`CartaVault ${CARTAVAULT_VERSION}`}>v{CARTAVAULT_VERSION}</small></h1>
      </div>
      <nav className="app-header-actions" aria-label={t('topbar.mainNavigation')}>
        {!online && <span className="marker-count offline-status" role="status"><WifiOff size={15} aria-hidden="true" /><span>{t('offline.status')}</span></span>}
        {isMapWorkspace && (
          <div className="marker-count" aria-live="polite">
            <strong>{markerCount}</strong>
            <span>{t('topbar.marker', { count: markerCount })}</span>
          </div>
        )}
        {isMapWorkspace && <button className={`panel-icon-button desktop-panel-layout-reset${defaultPanelLayoutLocked ? ' is-locked' : ''}`} type="button" aria-label={defaultPanelLayoutLocked ? t('topbar.restorePersonalLayout') : t('topbar.enableDefaultLayout')} title={defaultPanelLayoutLocked ? t('topbar.defaultLayoutLocked') : t('topbar.personalLayout')} aria-pressed={defaultPanelLayoutLocked} onClick={() => window.dispatchEvent(new Event(RESET_DESKTOP_PANEL_LAYOUT_EVENT))}><PanelsTopLeft className="desktop-panel-layout-reset__display" size={18} aria-hidden="true" /><span className="desktop-panel-layout-reset__lock" aria-hidden="true">{defaultPanelLayoutLocked ? <Lock size={10} /> : <LockOpen size={10} />}</span></button>}
        {isMapWorkspace && <ActionHistoryControls />}
        {user && <NotificationCenter userId={user.id} isAdmin={user.is_admin} onAccessChanged={onMapAccessChanged} onOpenRegistrationRequests={onOpenRegistrationRequests} />}
        {user && (
          <div className="user-account-cluster">
            <button
              className="topbar-theme-toggle"
              type="button"
              aria-label={nextThemeLabel}
              title={nextThemeLabel}
              aria-pressed={resolvedTheme === 'dark'}
              onClick={toggleTheme}
            >
              <span className={`topbar-theme-toggle__choice${resolvedTheme === 'light' ? ' is-active' : ''}`}>
                <Sun size={17} aria-hidden="true" />
              </span>
              <span className={`topbar-theme-toggle__choice${resolvedTheme === 'dark' ? ' is-active' : ''}`}>
                <Moon size={17} aria-hidden="true" />
              </span>
            </button>
            <button
              className="topbar-theme-toggle-mobile panel-icon-button"
              type="button"
              aria-label={nextThemeLabel}
              title={nextThemeLabel}
              aria-pressed={resolvedTheme === 'dark'}
              onClick={toggleTheme}
            >
              {resolvedTheme === 'light' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            <div ref={menu} className="user-account-menu">
              <button
                ref={trigger}
                type="button"
                className="user-account-menu__trigger"
                aria-label={t('topbar.userMenuFor', { name: user.display_name })}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => {
                  closeAdminForAccount()
                  setMenuOpen((open) => !open)
                }}
              >
                <span className="user-account-menu__avatar" aria-hidden="true">
                  {avatar ? <img src={avatar} alt="" /> : <UserRound size={17} />}
                </span>
                <span className="user-account-menu__name">{user.display_name}</span>
                <ChevronDown className={menuOpen ? 'open' : undefined} size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="user-account-menu__dropdown user-account-menu__dropdown--compact" role="menu" aria-label={t('topbar.userMenu')}>
                  <div className="user-account-menu__links">
                    <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); closeAdminForAccount(); setAccountOpen(true) }}>
                      <Settings2 size={17} aria-hidden="true" />{t('topbar.options')}
                    </button>
                    {saasEnabled && <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setContactOpen(true) }}>
                      <Mail size={17} aria-hidden="true" />{t('contact.menu')}
                    </button>}
                    {user.is_admin && (
                      <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setAccountOpen(false); onOpenAdmin() }}>
                        <ShieldCheck size={17} aria-hidden="true" />{t('app.administration')}
                      </button>
                    )}
                    <a className="user-account-menu__api-link" role="menuitem" href={API_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                      <Braces size={17} aria-hidden="true" />{t('topbar.api')}
                    </a>
                  </div>
                  <footer>
                    <button role="menuitem" type="button" onClick={() => void handleLogout()}>
                      <LogOut size={17} aria-hidden="true" />{t('topbar.logout')}
                    </button>
                  </footer>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      {accountOpen && <AccountModal trigger={trigger.current} onClose={() => setAccountOpen(false)} />}
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </header>
  )
}
