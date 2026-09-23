import { Link } from 'react-router-dom'
import { IconMapPin2 } from '@tabler/icons-react'
import { Images, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Route, Trash2, X } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import { CountryFlag } from '../maps/CountryFlag'
import type { PoiMap } from '../../types/map'

export type WorkspacePanel = 'maps' | 'places' | 'trip' | 'trips' | 'media' | 'categories' | 'tags' | 'statuses' | 'trash' | 'annotation-templates' | null
export type MobileMapNavigationDestination = 'places' | 'map' | 'trips' | 'categories' | 'tags' | 'statuses' | 'annotations' | 'media' | 'settings'

export interface NavigationProps {
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
  onMapNavigation?: (destination: MobileMapNavigationDestination, mapId: string) => void
  mobileMapTripsOpen?: boolean
}

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

export function MainNavigation({ activePanel, onPanelChange, dashboardActive = false, onOpenDashboard, collapsed = false, onCollapsedChange = () => undefined, maps = [], activeMapId = null, activeTrip = null, tripOpen = false, onOpenTrip = () => undefined, onCloseMap = () => undefined, onCloseTrip = () => undefined }: NavigationProps) {
  const { t } = useI18n()
  const activeTripMap = maps.find((map) => map.id === (activeTrip?.map_id ?? activeMapId)) ?? null

  const mapsActive = activePanel === 'maps'
  const navigationCollapseLabel = collapsed ? t('nav.expand') : t('nav.collapse')

  return <nav className={`main-navigation cv-main-navigation${collapsed ? ' is-collapsed' : ''}`} aria-label={t('nav.main')}>
    <Link className="main-navigation-brand" to="/dashboard" aria-label="CartaVault" onClick={onOpenDashboard ? (event) => { event.preventDefault(); onOpenDashboard() } : undefined}><img src="/cartavault-logo.png" alt="CartaVault" /></Link>
    <div className="cv-main-navigation__collapse-control">
      <button type="button" className="cv-main-navigation__collapse-toggle" aria-label={navigationCollapseLabel} title={navigationCollapseLabel} aria-pressed={collapsed} onClick={() => onCollapsedChange(!collapsed)}>
        {collapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
        <span aria-hidden="true">{navigationCollapseLabel}</span>
      </button>
    </div>
      <div className="main-navigation-links cv-main-navigation__items">
      <div className="cv-main-navigation__group">
        <button type="button" className={navClass(dashboardActive)} aria-label={t('dashboard.nav')} aria-pressed={dashboardActive} onClick={() => onOpenDashboard?.()}><LayoutDashboard size={23} /><span>{t('dashboard.nav')}</span></button>
        <div className="cv-main-navigation__maps-mobile">
          <button type="button" className={navClass(mapsActive)} aria-label={t('nav.myMaps')} aria-pressed={mapsActive} onClick={() => onPanelChange('maps')}><IconMapPin2 className="cv-main-navigation__vault-icon" aria-hidden="true" size={23} stroke={2} /><span>{t('nav.myMaps')}</span></button>
        </div>
        {activeMapId !== null && (() => { const activeMap = maps.find((map) => map.id === activeMapId); return activeMap ? <div className="cv-main-navigation__active-entry"><button type="button" className={`${navClass(activePanel === 'places')} cv-main-navigation__active-map-mobile`} aria-label={activeMap.name} aria-pressed={activePanel === 'places'} onClick={() => onPanelChange(activePanel === 'places' ? null : 'places')}><i className="cv-main-navigation__active-indicator" aria-hidden="true" /><CountryFlag countryCode={activeMap.country.iso_alpha2} fallbackSize={18} /><span className="cv-main-navigation__active-label">{activeMap.name}</span></button><button type="button" className="cv-main-navigation__close-entry" aria-label={`Fermer ${activeMap.name}`} title={`Fermer ${activeMap.name}`} onClick={onCloseMap}><X size={15} aria-hidden="true" /></button></div> : null })()}
        <button type="button" className={navClass(activePanel === 'trips')} aria-label={t('nav.trips')} aria-pressed={activePanel === 'trips'} onClick={() => onPanelChange('trips')}><Route size={23} /><span>{t('nav.trips')}</span></button>
         {activeTrip && <div className="cv-main-navigation__active-entry"><button type="button" className={`${navClass(tripOpen)} cv-main-navigation__active-trip`} aria-label={activeTrip.name} aria-pressed={tripOpen} title={activeTrip.name} onClick={onOpenTrip}><i className="cv-main-navigation__active-indicator" aria-hidden="true" />{activeTripMap ? <CountryFlag countryCode={activeTripMap.country.iso_alpha2} fallbackSize={18} /> : <Route size={23} aria-hidden="true" />}<span className="cv-main-navigation__active-label">{activeTrip.name}</span></button><button type="button" className="cv-main-navigation__close-entry" aria-label={`Fermer ${activeTrip.name}`} title={`Fermer ${activeTrip.name}`} onClick={onCloseTrip}><X size={15} aria-hidden="true" /></button></div>}
         <button type="button" className={`${navClass(activePanel === 'media')} cv-main-navigation__secondary-mobile`} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => onPanelChange('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" />
        <div className="cv-main-navigation__group cv-main-navigation__group--trash">
          <button type="button" className={`${navClass(activePanel === 'trash')} cv-main-navigation__secondary-mobile`} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => onPanelChange('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
        </div>
      </div>
  </nav>
}
