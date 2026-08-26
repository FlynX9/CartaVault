import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconVault } from '@tabler/icons-react'
import { CircleDot, Images, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Route, Shapes, Spline, Tag, Trash2, X } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import { CountryFlag } from '../maps/CountryFlag'
import type { PoiMap } from '../../types/map'

export type WorkspacePanel = 'maps' | 'places' | 'trip' | 'trips' | 'media' | 'categories' | 'tags' | 'statuses' | 'trash' | 'annotation-templates' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  dashboardActive?: boolean
  onOpenDashboard?: () => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  maps?: PoiMap[]
  activeMapId?: string | null
  activeTrip?: { id: string; name: string; map_id?: string | null } | null
  tripOpen?: boolean
  onOpenTrip?: () => void
  onCloseMap?: () => void
  onCloseTrip?: () => void
  organizationAvailable?: boolean
}

const MOBILE_NAVIGATION_MEDIA_QUERY = '(max-width: 900px), (max-device-width: 900px), (pointer: coarse), (max-aspect-ratio: 3 / 4)'

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

function closeMobileModalLayers() {
  if (window.matchMedia?.('(max-width: 760px)').matches) window.dispatchEvent(new Event('cartavault:close-mobile-modal-layers'))
}

export function MainNavigation({ activePanel, onPanelChange, dashboardActive = false, onOpenDashboard, collapsed = false, onCollapsedChange = () => undefined, maps = [], activeMapId = null, activeTrip = null, tripOpen = false, onOpenTrip = () => undefined, onCloseMap = () => undefined, onCloseTrip = () => undefined, organizationAvailable = true }: Props) {
  const { t } = useI18n()
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches === true)
  const [organizationOpen, setOrganizationOpen] = useState(false)
  const activeTripMap = maps.find((map) => map.id === (activeTrip?.map_id ?? activeMapId)) ?? null

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY)
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener?.('change', updateViewport)
    return () => mediaQuery.removeEventListener?.('change', updateViewport)
  }, [])
  useEffect(() => {
    if (!organizationAvailable) setOrganizationOpen(false)
  }, [organizationAvailable])

  const mapsActive = activePanel === 'maps'
  const selectPanel = (panel: 'maps' | 'trips' | 'media' | 'trash') => {
    closeMobileModalLayers()
    setOrganizationOpen(false)
    onPanelChange(panel)
  }
  const selectOrganizationPanel = (panel: Exclude<WorkspacePanel, 'maps' | 'media' | 'places' | 'trash' | null>) => {
    closeMobileModalLayers()
    setOrganizationOpen(false)
    onPanelChange(panel)
  }
  const navigationCollapseLabel = collapsed ? t('nav.expand') : t('nav.collapse')

  return <nav className={`main-navigation cv-main-navigation${collapsed ? ' is-collapsed' : ''}${isMobileViewport ? ' is-mobile' : ''}`} aria-label={t('nav.main')}>
    <Link className="main-navigation-brand" to="/dashboard" aria-label="CartaVault" onClick={onOpenDashboard ? (event) => { event.preventDefault(); onOpenDashboard() } : undefined}><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    {!isMobileViewport && <div className="cv-main-navigation__collapse-control">
      <button type="button" className="cv-main-navigation__collapse-toggle" aria-label={navigationCollapseLabel} title={navigationCollapseLabel} aria-pressed={collapsed} onClick={() => onCollapsedChange(!collapsed)}>
        {collapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
        <span aria-hidden="true">{navigationCollapseLabel}</span>
      </button>
    </div>}
      <div className="main-navigation-links cv-main-navigation__items">
      <div className="cv-main-navigation__group">
        <button type="button" className={navClass(dashboardActive)} aria-label={t('dashboard.nav')} aria-pressed={dashboardActive} onClick={() => { closeMobileModalLayers(); onOpenDashboard?.() }}><LayoutDashboard size={23} /><span>{t('dashboard.nav')}</span></button>
        <div className="cv-main-navigation__maps-mobile">
          <button type="button" className={navClass(mapsActive)} aria-label={t('nav.myMaps')} aria-pressed={mapsActive} onClick={() => selectPanel('maps')}><IconVault className="cv-main-navigation__vault-icon" aria-hidden="true" size={23} stroke={2} /><span>{t('nav.myMaps')}</span></button>
        </div>
        {activeMapId !== null && (() => { const activeMap = maps.find((map) => map.id === activeMapId); return activeMap ? <div className="cv-main-navigation__active-entry"><button type="button" className={`${navClass(activePanel === 'places')} cv-main-navigation__active-map-mobile`} aria-label={activeMap.name} aria-pressed={activePanel === 'places'} onClick={() => { closeMobileModalLayers(); onPanelChange(activePanel === 'places' ? null : 'places') }}><i className="cv-main-navigation__active-indicator" aria-hidden="true" /><CountryFlag countryCode={activeMap.country.iso_alpha2} fallbackSize={18} /><span className="cv-main-navigation__active-label">{activeMap.name}</span></button><button type="button" className="cv-main-navigation__close-entry" aria-label={`Fermer ${activeMap.name}`} title={`Fermer ${activeMap.name}`} onClick={onCloseMap}><X size={15} aria-hidden="true" /></button></div> : null })()}
        <button type="button" className={navClass(activePanel === 'trips')} aria-label={t('nav.trips')} aria-pressed={activePanel === 'trips'} onClick={() => selectPanel('trips')}><Route size={23} /><span>{t('nav.trips')}</span></button>
         {activeTrip && <div className="cv-main-navigation__active-entry"><button type="button" className={`${navClass(tripOpen)} cv-main-navigation__active-trip`} aria-label={activeTrip.name} aria-pressed={tripOpen} title={activeTrip.name} onClick={onOpenTrip}><i className="cv-main-navigation__active-indicator" aria-hidden="true" />{activeTripMap ? <CountryFlag countryCode={activeTripMap.country.iso_alpha2} fallbackSize={18} /> : <Route size={23} aria-hidden="true" />}<span className="cv-main-navigation__active-label">{activeTrip.name}</span></button><button type="button" className="cv-main-navigation__close-entry" aria-label={`Fermer ${activeTrip.name}`} title={`Fermer ${activeTrip.name}`} onClick={onCloseTrip}><X size={15} aria-hidden="true" /></button></div>}
        <button type="button" className={`${navClass(activePanel === 'media')} cv-main-navigation__secondary-mobile`} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => selectPanel('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" />
        <div className="cv-main-navigation__group cv-main-navigation__group--trash">
          <button type="button" className={`${navClass(activePanel === 'trash')} cv-main-navigation__secondary-mobile`} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => selectPanel('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
        </div>
        {isMobileViewport && organizationAvailable && <div className="cv-main-navigation__organization-mobile">
          <button type="button" className={navClass(activePanel === 'categories' || activePanel === 'tags' || activePanel === 'statuses' || activePanel === 'annotation-templates' || activePanel === 'media' || activePanel === 'trash')} aria-label={t('nav.organization')} aria-expanded={organizationOpen} onClick={() => setOrganizationOpen((open) => !open)}><Shapes size={23} /><span>{t('nav.organization')}</span></button>
          {organizationOpen && <div className="cv-main-navigation__organization-menu" role="menu" aria-label={t('nav.organization')}>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('categories')}><Shapes size={17} /><span>{t('nav.categories')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('tags')}><Tag size={17} /><span>{t('nav.tags')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('statuses')}><CircleDot size={17} /><span>{t('nav.statuses')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('annotation-templates')}><Spline size={17} /><span>{t('nav.annotations')}</span></button>
            <div className="cv-main-navigation__organization-menu-separator" role="separator" />
            <button type="button" role="menuitem" onClick={() => selectPanel('media')}><Images size={17} /><span>{t('nav.media')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectPanel('trash')}><Trash2 size={17} /><span>{t('nav.trash')}</span></button>
          </div>}
        </div>}
      </div>
  </nav>
}
