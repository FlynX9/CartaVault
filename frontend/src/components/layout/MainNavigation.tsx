import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconMap2, IconTimelineEvent, IconVault, IconWorldMap } from '@tabler/icons-react'
import { CircleDot, Images, LayoutDashboard, Route, Shapes, Tag, Trash2, Spline } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n'

export type WorkspacePanel = 'maps' | 'places' | 'media' | 'categories' | 'tags' | 'statuses' | 'trash' | 'annotation-templates' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  onWorkspacePanelToggle?: (panel: Exclude<WorkspacePanel, null>) => void
  onPlacesPanelToggle?: () => void
  placesPanelCollapsed?: boolean
  isAdmin?: boolean
  onOpenTrips?: () => void
  tripPlanningActive?: boolean
  tripTimelineShortcutActive?: boolean
  dashboardActive?: boolean
  onOpenDashboard?: () => void
  hasMaps?: boolean
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

const closeMobileModalLayers = () => {
  if (window.matchMedia?.('(max-width: 760px)').matches) {
    window.dispatchEvent(new Event('cartavault:close-mobile-modal-layers'))
  }
}

const mobilePersistentPanels = new Set<Exclude<WorkspacePanel, null>>([
  'media',
  'categories',
  'tags',
  'statuses',
  'annotation-templates',
])

export function MainNavigation({ activePanel, onPanelChange, onWorkspacePanelToggle = (panel) => onPanelChange(activePanel === panel ? null : panel), onPlacesPanelToggle = () => undefined, placesPanelCollapsed = false, isAdmin = false, onOpenTrips = () => undefined, tripPlanningActive = false, tripTimelineShortcutActive = false, dashboardActive = false, onOpenDashboard, hasMaps = true }: Props) {
  const { t } = useI18n()
  const [organizationOpen, setOrganizationOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches === true)
  const organizationMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(max-width: 760px)')
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener?.('change', updateViewport)
    return () => mediaQuery.removeEventListener?.('change', updateViewport)
  }, [])
  useEffect(() => {
    if (!organizationOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !organizationMenuRef.current?.contains(event.target)) setOrganizationOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [organizationOpen])
  const togglePanel = (panel: Exclude<WorkspacePanel, null>) => {
    closeMobileModalLayers()
    // These entries are full workspace views on mobile, not collapsible
    // sidebars. Re-selecting the active entry must keep its panel open.
    if (mobilePersistentPanels.has(panel) && activePanel === panel && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches) return
    if (activePanel === panel) onWorkspacePanelToggle(panel)
    else onPanelChange(panel)
  }
  const placesActive = activePanel === 'places' && !tripPlanningActive
  const placesPanelOpen = placesActive && !placesPanelCollapsed
  const placesMapMode = isMobileViewport && placesActive && placesPanelCollapsed
  const placesNavigationLabel = placesMapMode ? t('nav.map') : t('nav.places')
  const tripTimelineActive = isMobileViewport && tripPlanningActive && !tripTimelineShortcutActive
  const tripsNavigationLabel = tripTimelineActive ? t('trips.timeline') : t('nav.trips')
  const selectOrganizationPanel = (panel: 'categories' | 'tags' | 'statuses' | 'trash' | 'annotation-templates') => {
    closeMobileModalLayers()
    setOrganizationOpen(false)
    togglePanel(panel)
  }

  return <nav className="main-navigation cv-main-navigation" aria-label={t('nav.main')}>
    <Link className="main-navigation-brand" to="/dashboard" aria-label="CartaVault" onClick={onOpenDashboard ? (event) => { event.preventDefault(); onOpenDashboard() } : undefined}><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    <div className="main-navigation-links cv-main-navigation__items">
      <div className="cv-main-navigation__group">
        <button type="button" className={navClass(dashboardActive)} aria-label={t('dashboard.nav')} aria-pressed={dashboardActive} onClick={() => { closeMobileModalLayers(); onOpenDashboard?.() }}><LayoutDashboard size={23} /><span>{t('dashboard.nav')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" />
      <div className="cv-main-navigation__group" aria-label={t('app.workspace')}>
        <button type="button" className={navClass(activePanel === 'maps')} aria-label={t('nav.maps')} aria-pressed={activePanel === 'maps'} onClick={() => togglePanel('maps')}><IconVault className="cv-main-navigation__vault-icon" aria-hidden="true" size={23} stroke={2} /><span>{t('nav.maps')}</span></button>
        {hasMaps && <><button type="button" className={`${navClass(placesActive)} cv-main-navigation__places-toggle`} data-panel-open={placesPanelOpen} aria-label={placesNavigationLabel} aria-pressed={placesActive} onClick={() => { closeMobileModalLayers(); if (placesActive) onPlacesPanelToggle(); else onPanelChange('places') }}>
          <span className="cv-main-navigation__icon-slot" aria-hidden="true">
            <IconMap2 className={`cv-main-navigation__places-default-icon${placesMapMode ? '' : ' is-visible'}`} size={23} stroke={2} />
            <IconWorldMap className={`cv-main-navigation__places-world-map-icon${placesMapMode ? ' is-visible' : ''}`} size={23} stroke={2} />
          </span>
          <span className="cv-main-navigation__label-slot" aria-hidden="true">
            <span className={placesMapMode ? '' : 'is-visible'}>{t('nav.places')}</span>
            <span className={placesMapMode ? 'is-visible' : ''}>{t('nav.map')}</span>
            {isMobileViewport && <small className="cv-main-navigation__mode-dots">
              <i className={placesMapMode ? '' : 'is-active'} />
              <i className={placesMapMode ? 'is-active' : ''} />
            </small>}
          </span>
        </button>
        <button type="button" className={navClass(tripPlanningActive)} aria-label={tripsNavigationLabel} aria-pressed={tripPlanningActive} onClick={() => { closeMobileModalLayers(); onOpenTrips() }}>
          <span className="cv-main-navigation__icon-slot" aria-hidden="true">
            <Route className={`cv-main-navigation__trip-default-icon${tripTimelineActive ? '' : ' is-visible'}`} size={23} />
            <IconTimelineEvent className={`cv-main-navigation__trip-timeline-icon${tripTimelineActive ? ' is-visible' : ''}`} size={23} stroke={2} />
          </span>
          <span className="cv-main-navigation__label-slot" aria-hidden="true">
            <span className={tripTimelineActive ? '' : 'is-visible'}>{t('nav.trips')}</span>
            <span className={tripTimelineActive ? 'is-visible' : ''}>{t('trips.timeline')}</span>
            {isMobileViewport && <small className="cv-main-navigation__mode-dots">
              <i className={tripTimelineActive ? '' : 'is-active'} />
              <i className={tripTimelineActive ? 'is-active' : ''} />
            </small>}
          </span>
        </button></>}
      </div>
      {hasMaps && <><div className="cv-main-navigation__separator" role="separator" aria-label={t('nav.media')} />
      <div className="cv-main-navigation__group" aria-label={t('nav.media')}>
        <button type="button" className={navClass(activePanel === 'media')} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => togglePanel('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
      </div></>}
      <div className="cv-main-navigation__separator" role="separator" aria-label={t('nav.organization')} />
      <div className="cv-main-navigation__group cv-main-navigation__organization-desktop" aria-label={t('nav.organization')}>
        {hasMaps && <><button type="button" className={navClass(activePanel === 'categories')} aria-label={t('nav.categories')} aria-pressed={activePanel === 'categories'} onClick={() => togglePanel('categories')}><Shapes size={23} /><span>{t('nav.categories')}</span></button>
        <button type="button" className={navClass(activePanel === 'tags')} aria-label={t('nav.tags')} aria-pressed={activePanel === 'tags'} onClick={() => togglePanel('tags')}><Tag size={23} /><span>{t('nav.tags')}</span></button>
        {isAdmin && <button type="button" className={navClass(activePanel === 'statuses')} aria-label={t('nav.statuses')} aria-pressed={activePanel === 'statuses'} onClick={() => togglePanel('statuses')}><CircleDot size={23} /><span>{t('nav.statuses')}</span></button>}
        <button type="button" className={navClass(activePanel === 'annotation-templates')} aria-label={t('nav.annotations')} aria-pressed={activePanel === 'annotation-templates'} onClick={() => togglePanel('annotation-templates')}><Spline size={23} /><span>{t('nav.annotations')}</span></button></>}
        {hasMaps && <div className="cv-main-navigation__separator" role="separator" />}
        <button type="button" className={navClass(activePanel === 'trash')} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => togglePanel('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
      </div>
      {hasMaps && <div ref={organizationMenuRef} className="cv-main-navigation__organization-mobile">
        <button type="button" className={navClass(organizationOpen || activePanel === 'categories' || activePanel === 'tags' || activePanel === 'annotation-templates' || activePanel === 'statuses' || activePanel === 'trash')} aria-label={t('nav.organization')} aria-expanded={organizationOpen} onClick={() => { closeMobileModalLayers(); setOrganizationOpen((open) => !open) }}><Shapes size={23} /><span>{t('nav.organization')}</span></button>
        {organizationOpen && <div className="cv-main-navigation__organization-menu" role="menu" aria-label={t('nav.organization')}>
          <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('categories')}><Shapes size={18} /><span>{t('nav.categories')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('tags')}><Tag size={18} /><span>{t('nav.tags')}</span></button>
          {isAdmin && <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('statuses')}><CircleDot size={18} /><span>{t('nav.statuses')}</span></button>}
          <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('annotation-templates')}><Spline size={18} /><span>{t('nav.annotations')}</span></button>
          <div className="cv-main-navigation__organization-menu-separator" role="separator" />
          <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('trash')}><Trash2 size={18} /><span>{t('nav.trash')}</span></button>
        </div>}
      </div>}
    </div>
  </nav>
}
