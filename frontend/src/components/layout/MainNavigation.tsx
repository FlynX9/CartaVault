import { Link, useLocation } from 'react-router-dom'
import { CircleDot, FolderOutput, MapPinned, MapPin, Shapes, Tag } from 'lucide-react'

export type WorkspacePanel = 'maps' | 'places' | 'categories' | 'tags' | 'statuses' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

export function MainNavigation({ activePanel, onPanelChange }: Props) {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const togglePanel = (panel: Exclude<WorkspacePanel, null>) => onPanelChange(activePanel === panel ? null : panel)

  return <nav className="main-navigation cv-main-navigation" aria-label="Navigation CartaVault">
    <Link className="main-navigation-brand" to="/" aria-label="CartaVault"><img src="/cartavault-icon.svg" alt="CartaVault" /></Link>
    <div className="main-navigation-links cv-main-navigation__items">
      <button type="button" className={navClass(!isAdmin && activePanel === 'maps')} aria-label="Cartes" aria-pressed={!isAdmin && activePanel === 'maps'} onClick={() => togglePanel('maps')}><MapPinned size={21} /><span>Cartes</span></button>
      <button type="button" className={navClass(!isAdmin && activePanel === 'places')} aria-label="Lieux" aria-pressed={!isAdmin && activePanel === 'places'} onClick={() => togglePanel('places')}><MapPin size={21} /><span>Lieux</span></button>
      <button type="button" className={navClass(!isAdmin && activePanel === 'categories')} aria-label="Catégories" aria-pressed={!isAdmin && activePanel === 'categories'} onClick={() => togglePanel('categories')}><Shapes size={21} /><span>Catégories</span></button>
      <button type="button" className={navClass(!isAdmin && activePanel === 'tags')} aria-label="Tags" aria-pressed={!isAdmin && activePanel === 'tags'} onClick={() => togglePanel('tags')}><Tag size={21} /><span>Tags</span></button>
      <button type="button" className={navClass(!isAdmin && activePanel === 'statuses')} aria-label="Statuts" aria-pressed={!isAdmin && activePanel === 'statuses'} onClick={() => togglePanel('statuses')}><CircleDot size={21} /><span>Statuts</span></button>
      <span className="main-navigation-disabled cv-main-navigation__item" aria-label="Export bientôt disponible"><FolderOutput size={21} /><span>Export</span></span>
    </div>
  </nav>
}
