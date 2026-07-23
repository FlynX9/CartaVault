import { useEffect, useRef, useState } from 'react'
import { Braces, ChevronDown, LogOut, Moon, Settings2, ShieldCheck, Sun } from 'lucide-react'

import { accountAvatarUrl } from '../../api/account'
import { useAuth } from '../../auth/useAuth'
import { API_BASE_URL } from '../../config'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { AccountModal } from '../account/AccountModal'
import { NotificationCenter } from '../notifications/NotificationCenter'

interface TopBarProps {
  isMapWorkspace: boolean
  markerCount: number
  onMapAccessChanged: () => void
  onOpenAdmin: () => void
}

const API_DOCUMENTATION_URL = API_BASE_URL === '/api' ? 'http://localhost:8000/docs' : `${API_BASE_URL}/docs`

export function TopBar({ isMapWorkspace, markerCount, onMapAccessChanged, onOpenAdmin }: TopBarProps) {
  const { user, logout } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const initial = user?.display_name.trim().charAt(0).toLocaleUpperCase() || '?'
  const avatar = accountAvatarUrl(user?.avatar_url ?? null)
  const nextThemeLabel = resolvedTheme === 'dark' ? t('auth.theme.light') : t('auth.theme.dark')

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

  return (
    <header className="app-header">
      <div className="brand-block">
        <p className="app-eyebrow">{isMapWorkspace ? t('app.workspace') : t('app.administration')}</p>
        <h1 className="cartavault-wordmark"><span>Carta</span><strong>Vault</strong></h1>
      </div>
      <nav className="app-header-actions" aria-label={t('topbar.mainNavigation')}>
        {isMapWorkspace && (
          <div className="marker-count" aria-live="polite">
            <strong>{markerCount}</strong>
            <span>{t('topbar.marker', { count: markerCount })}</span>
          </div>
        )}
        {user && <NotificationCenter userId={user.id} onAccessChanged={onMapAccessChanged} />}
        {user && (
          <div className="user-account-cluster">
            <div ref={menu} className="user-account-menu">
              <button
                ref={trigger}
                type="button"
                className="user-account-menu__trigger"
                aria-label={t('topbar.userMenuFor', { name: user.display_name })}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="user-account-menu__avatar" aria-hidden="true">
                  {avatar ? <img src={avatar} alt="" /> : initial}
                </span>
                <span className="user-account-menu__name">{user.display_name}</span>
                <ChevronDown className={menuOpen ? 'open' : undefined} size={15} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="user-account-menu__dropdown user-account-menu__dropdown--compact" role="menu" aria-label={t('topbar.userMenu')}>
                  <div className="user-account-menu__links">
                    <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setAccountOpen(true) }}>
                      <Settings2 size={17} aria-hidden="true" />{t('topbar.options')}
                    </button>
                    {user.is_admin && (
                      <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onOpenAdmin() }}>
                        <ShieldCheck size={17} aria-hidden="true" />{t('app.administration')}
                      </button>
                    )}
                    <a role="menuitem" href={API_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                      <Braces size={17} aria-hidden="true" />{t('topbar.api')}
                    </a>
                  </div>
                  <footer>
                    <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); void logout() }}>
                      <LogOut size={17} aria-hidden="true" />{t('topbar.logout')}
                    </button>
                  </footer>
                </div>
              )}
            </div>
            <button
              className="topbar-theme-toggle"
              type="button"
              aria-label={nextThemeLabel}
              title={nextThemeLabel}
              aria-pressed={resolvedTheme === 'dark'}
              onClick={toggleTheme}
            >
              <span className={resolvedTheme === 'light' ? 'is-active' : undefined}>
                <Sun size={17} aria-hidden="true" />
              </span>
              <span className={resolvedTheme === 'dark' ? 'is-active' : undefined}>
                <Moon size={17} aria-hidden="true" />
              </span>
            </button>
          </div>
        )}
      </nav>
      {accountOpen && <AccountModal trigger={trigger.current} onClose={() => setAccountOpen(false)} />}
    </header>
  )
}
