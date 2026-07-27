import { Link } from 'react-router-dom'
import { CircleDot, Images, LayoutDashboard, MapPinned, MapPin, Route, Shapes, Tag, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n'

export type WorkspacePanel = 'maps' | 'places' | 'media' | 'categories' | 'tags' | 'statuses' | 'trash' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  onWorkspacePanelToggle?: (panel: Exclude<WorkspacePanel, null>) => void
  onPlacesPanelToggle?: () => void
  isAdmin?: boolean
  onOpenTrips?: () => void
  tripPlanningActive?: boolean
  dashboardActive?: boolean
  onOpenDashboard?: () => void
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

export function MainNavigation({ activePanel, onPanelChange, onWorkspacePanelToggle = (panel) => onPanelChange(activePanel === panel ? null : panel), onPlacesPanelToggle = () => undefined, isAdmin = false, onOpenTrips = () => undefined, tripPlanningActive = false, dashboardActive = false, onOpenDashboard }: Props) {
  const { t } = useI18n()
  const togglePanel = (panel: Exclude<WorkspacePanel, null>) => activePanel === panel ? onWorkspacePanelToggle(panel) : onPanelChange(panel)
  const placesActive = activePanel === 'places' && !tripPlanningActive

  return <nav className="main-navigation cv-main-navigation" aria-label={t('nav.main')}>
    <Link className="main-navigation-brand" to="/dashboard" aria-label="CartaVault" onClick={onOpenDashboard ? (event) => { event.preventDefault(); onOpenDashboard() } : undefined}><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    <div className="main-navigation-links cv-main-navigation__items">
      <div className="cv-main-navigation__group">
        <button type="button" className={navClass(dashboardActive)} aria-label={t('dashboard.nav')} aria-pressed={dashboardActive} onClick={onOpenDashboard}><LayoutDashboard size={23} /><span>{t('dashboard.nav')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" />
      <div className="cv-main-navigation__group" aria-label="Cartographie">
        <button type="button" className={navClass(activePanel === 'maps')} aria-label={t('nav.maps')} aria-pressed={activePanel === 'maps'} onClick={() => togglePanel('maps')}><MapPinned size={23} /><span>{t('nav.maps')}</span></button>
        <button type="button" className={navClass(placesActive)} aria-label={t('nav.places')} aria-pressed={placesActive} onClick={() => placesActive ? onPlacesPanelToggle() : onPanelChange('places')}><MapPin size={23} /><span>{t('nav.places')}</span></button>
        <button type="button" className={navClass(tripPlanningActive)} aria-label={t('nav.trips')} aria-pressed={tripPlanningActive} onClick={onOpenTrips}><Route size={23} /><span>{t('nav.trips')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" aria-label="Médias" />
      <div className="cv-main-navigation__group" aria-label="Médias">
        <button type="button" className={navClass(activePanel === 'media')} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => togglePanel('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" aria-label="Organisation" />
      <div className="cv-main-navigation__group" aria-label="Organisation">
        <button type="button" className={navClass(activePanel === 'categories')} aria-label={t('nav.categories')} aria-pressed={activePanel === 'categories'} onClick={() => togglePanel('categories')}><Shapes size={23} /><span>{t('nav.categories')}</span></button>
        <button type="button" className={navClass(activePanel === 'tags')} aria-label={t('nav.tags')} aria-pressed={activePanel === 'tags'} onClick={() => togglePanel('tags')}><Tag size={23} /><span>{t('nav.tags')}</span></button>
        {isAdmin && <button type="button" className={navClass(activePanel === 'statuses')} aria-label={t('nav.statuses')} aria-pressed={activePanel === 'statuses'} onClick={() => togglePanel('statuses')}><CircleDot size={23} /><span>{t('nav.statuses')}</span></button>}
        <button type="button" className={navClass(activePanel === 'trash')} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => togglePanel('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
      </div>
    </div>
  </nav>
}
