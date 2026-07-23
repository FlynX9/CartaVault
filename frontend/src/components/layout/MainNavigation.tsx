import { Link } from 'react-router-dom'
import { CircleDot, Images, MapPinned, MapPin, Route, Shapes, Tag } from 'lucide-react'

export type WorkspacePanel = 'maps' | 'places' | 'media' | 'categories' | 'tags' | 'statuses' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  isAdmin?: boolean
  onOpenTrips?: () => void
  tripPlanningActive?: boolean
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

export function MainNavigation({ activePanel, onPanelChange, isAdmin = false, onOpenTrips = () => undefined, tripPlanningActive = false }: Props) {
  const togglePanel = (panel: Exclude<WorkspacePanel, null>) => onPanelChange(activePanel === panel ? null : panel)

  return <nav className="main-navigation cv-main-navigation" aria-label="Navigation CartaVault">
    <Link className="main-navigation-brand" to="/" aria-label="CartaVault"><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    <div className="main-navigation-links cv-main-navigation__items">
      <button type="button" className={navClass(activePanel === 'maps')} aria-label="Cartes" aria-pressed={activePanel === 'maps'} onClick={() => togglePanel('maps')}><MapPinned size={21} /><span>Cartes</span></button>
      <button type="button" className={navClass(activePanel === 'places' && !tripPlanningActive)} aria-label="Lieux" aria-pressed={activePanel === 'places' && !tripPlanningActive} onClick={() => togglePanel('places')}><MapPin size={21} /><span>Lieux</span></button>
      <button type="button" className={navClass(activePanel === 'media')} aria-label="Médias" aria-pressed={activePanel === 'media'} onClick={() => togglePanel('media')}><Images size={21} /><span>Médias</span></button>
      <button type="button" className={navClass(tripPlanningActive)} aria-label="Préparation de sortie" aria-pressed={tripPlanningActive} onClick={onOpenTrips}><Route size={21} /><span>Sorties</span></button>
      <button type="button" className={navClass(activePanel === 'categories')} aria-label="Catégories" aria-pressed={activePanel === 'categories'} onClick={() => togglePanel('categories')}><Shapes size={21} /><span>Catégories</span></button>
      <button type="button" className={navClass(activePanel === 'tags')} aria-label="Tags" aria-pressed={activePanel === 'tags'} onClick={() => togglePanel('tags')}><Tag size={21} /><span>Tags</span></button>
      {isAdmin && <button type="button" className={navClass(activePanel === 'statuses')} aria-label="Statuts" aria-pressed={activePanel === 'statuses'} onClick={() => togglePanel('statuses')}><CircleDot size={21} /><span>Statuts</span></button>}
    </div>
  </nav>
}
