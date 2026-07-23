import { Link } from 'react-router-dom'
import { CircleDot, Images, MapPinned, MapPin, Route, Shapes, Tag } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n'

export type WorkspacePanel = 'maps' | 'places' | 'media' | 'categories' | 'tags' | 'statuses' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  onPlacesPanelToggle?: () => void
  isAdmin?: boolean
  onOpenTrips?: () => void
  tripPlanningActive?: boolean
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

export function MainNavigation({ activePanel, onPanelChange, onPlacesPanelToggle = () => undefined, isAdmin = false, onOpenTrips = () => undefined, tripPlanningActive = false }: Props) {
  const { t } = useI18n()
  const togglePanel = (panel: Exclude<WorkspacePanel, null>) => onPanelChange(activePanel === panel ? null : panel)
  const placesActive = activePanel === 'places' && !tripPlanningActive

  return <nav className="main-navigation cv-main-navigation" aria-label={t('nav.main')}>
    <Link className="main-navigation-brand" to="/" aria-label="CartaVault"><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    <div className="main-navigation-links cv-main-navigation__items">
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
      </div>
    </div>
  </nav>
}
