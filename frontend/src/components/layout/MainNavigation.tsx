import { Link, useLocation } from 'react-router-dom'
import { FolderCog, Map, MapPinned, Settings } from 'lucide-react'

import logo from '../../assets/branding/cartavault-logo-light.svg'

export function MainNavigation() {
  const location = useLocation(); const isAdmin = location.pathname.startsWith('/admin')
  return <nav className="main-navigation" aria-label="Navigation CartaVault"><Link className="main-navigation-brand" to="/" aria-label="CartaVault, carte"><img src={logo} alt="CartaVault" /></Link><div className="main-navigation-links"><Link className={!isAdmin ? 'active' : undefined} to="/" aria-label="Carte" title="Carte"><Map size={21} /><span>Carte</span></Link><Link className={!isAdmin ? 'active' : undefined} to="/" aria-label="Lieux" title="Lieux"><MapPinned size={21} /><span>Lieux</span></Link><span className="main-navigation-disabled" aria-label="Préparation de sortie bientôt disponible" title="Bientôt disponible"><FolderCog size={21} /><span>Export</span></span></div><div className="main-navigation-bottom"><Link className={isAdmin ? 'active' : undefined} to="/admin/categories" aria-label="Administration" title="Administration"><Settings size={21} /><span>Administration</span></Link></div></nav>
}
