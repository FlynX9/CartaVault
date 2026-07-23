import { useEffect, useRef, useState } from 'react'
import { Braces, ChevronDown, LogOut, Moon, Settings2, ShieldCheck, Sun } from 'lucide-react'

import { accountAvatarUrl } from '../../api/account'
import { useAuth } from '../../auth/useAuth'
import { API_BASE_URL } from '../../config'
import { AccountModal } from '../account/AccountModal'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { useTheme } from '../../theme/useTheme'

interface TopBarProps { isMapWorkspace: boolean; markerCount: number; onMapAccessChanged: () => void; onOpenAdmin: () => void }

const API_DOCUMENTATION_URL = API_BASE_URL === '/api' ? 'http://localhost:8000/docs' : `${API_BASE_URL}/docs`

export function TopBar({ isMapWorkspace, markerCount, onMapAccessChanged, onOpenAdmin }: TopBarProps) {
  const { user, logout } = useAuth()
  const { resolvedTheme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const initial = user?.display_name.trim().charAt(0).toLocaleUpperCase() || '?'
  const avatar = accountAvatarUrl(user?.avatar_url ?? null)
  useEffect(() => {
    if (!menuOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutsideClick); window.removeEventListener('keydown', closeOnEscape) }
  }, [menuOpen])
  return <header className="app-header"><div className="brand-block"><p className="app-eyebrow">{isMapWorkspace ? 'Espace cartographique' : 'Administration'}</p><h1 className="cartavault-wordmark"><span>Carta</span><strong>Vault</strong></h1></div><nav className="app-header-actions" aria-label="Navigation principale">{isMapWorkspace && <div className="marker-count" aria-live="polite"><strong>{markerCount}</strong><span>marqueur{markerCount > 1 ? 's' : ''}</span></div>}{user && <NotificationCenter userId={user.id} onAccessChanged={onMapAccessChanged} />}{user && <div ref={menu} className="user-account-menu"><button ref={trigger} type="button" className="user-account-menu__trigger" aria-label={`Menu utilisateur de ${user.display_name}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span className="user-account-menu__avatar" aria-hidden="true">{avatar ? <img src={avatar} alt="" /> : initial}</span><span className="user-account-menu__name">{user.display_name}</span><ChevronDown className={menuOpen ? 'open' : undefined} size={15} aria-hidden="true" /></button>{menuOpen && <div className="user-account-menu__dropdown user-account-menu__dropdown--compact" role="menu" aria-label="Menu utilisateur"><div className="user-account-menu__links"><button className="user-theme-switch" role="menuitemcheckbox" aria-checked={resolvedTheme === 'dark'} type="button" onClick={toggleTheme}>{resolvedTheme === 'dark' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}<span>Thème sombre</span><i aria-hidden="true"><b /></i></button><button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setAccountOpen(true) }}><Settings2 size={17} aria-hidden="true" />Options</button>{user.is_admin && <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onOpenAdmin() }}><ShieldCheck size={17} aria-hidden="true" />Administration</button>}<a role="menuitem" href={API_DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}><Braces size={17} aria-hidden="true" />API</a></div><footer><button role="menuitem" type="button" onClick={() => { setMenuOpen(false); void logout() }}><LogOut size={17} aria-hidden="true" />Déconnexion</button></footer></div>}</div>}</nav>{accountOpen && <AccountModal trigger={trigger.current} onClose={() => setAccountOpen(false)} />}</header>
}
