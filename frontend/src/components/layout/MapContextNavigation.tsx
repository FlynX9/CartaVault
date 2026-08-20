import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleDot, Download, Ellipsis, FileUp, MapPin, Route, Settings2, Shapes, Spline, Tag, Users } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import { CountryFlag } from '../maps/CountryFlag'
import type { PoiMap } from '../../types/map'
import type { WorkspacePanel } from './MainNavigation'

interface Props {
  poiMap: PoiMap
  maps: PoiMap[]
  activePanel: WorkspacePanel
  tripPlanningActive: boolean
  onMapChange: (mapId: string) => void
  onPanelChange: (panel: WorkspacePanel) => void
  onOpenTrips: () => void
  onImport: () => void
  onExport: () => void
  onSettings: () => void
  onMembers: () => void
}

function tabClass(active: boolean): string {
  return `map-context-navigation__tab${active ? ' is-active' : ''}`
}

export function MapContextNavigation({ poiMap, maps, activePanel, tripPlanningActive, onMapChange, onPanelChange, onOpenTrips, onImport, onExport, onSettings, onMembers }: Props) {
  const { t } = useI18n()
  const [openMenu, setOpenMenu] = useState<'maps' | 'organization' | 'more' | null>(null)
  const navigationRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (openMenu === null) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  const selectPanel = (panel: WorkspacePanel) => {
    setOpenMenu(null)
    onPanelChange(panel)
  }
  const placesActive = activePanel === 'places' && !tripPlanningActive
  const organizationActive = activePanel === 'categories' || activePanel === 'tags' || activePanel === 'statuses' || activePanel === 'annotation-templates'
  const hasMoreActions = poiMap.can_edit === true || poiMap.can_export !== false || poiMap.can_manage_members === true

  return <nav ref={navigationRef} className="map-context-navigation" aria-label={t('nav.mapContext')}>
    <div className="map-context-navigation__identity">
      <div className="map-context-navigation__menu-host map-context-navigation__map-switcher">
        <button type="button" className="map-context-navigation__map-trigger" aria-label={t('nav.chooseMap')} aria-haspopup="listbox" aria-expanded={openMenu === 'maps'} onClick={() => setOpenMenu((current) => current === 'maps' ? null : 'maps')}>
          <CountryFlag countryCode={poiMap.country.iso_alpha2} className="map-context-navigation__map-flag" fallbackSize={18} />
          <span className="map-context-navigation__map-copy"><strong>{poiMap.name}</strong><small>{poiMap.country.name}</small></span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === 'maps' && <div className="map-context-navigation__menu map-context-navigation__map-menu" role="listbox" aria-label={t('nav.chooseMap')}>
          {maps.map((map) => <button type="button" role="option" aria-selected={map.id === poiMap.id} key={map.id} onClick={() => { setOpenMenu(null); if (map.id !== poiMap.id) onMapChange(map.id) }}>
            <CountryFlag countryCode={map.country.iso_alpha2} className="map-context-navigation__map-flag" fallbackSize={18} />
            <span className="map-context-navigation__map-copy"><strong>{map.name}</strong><small>{map.country.name}</small></span>
          </button>)}
        </div>}
      </div>
    </div>
    <div className="map-context-navigation__tabs">
      <button type="button" className={tabClass(placesActive)} aria-pressed={placesActive} onClick={() => selectPanel(placesActive ? null : 'places')}><MapPin size={17} /><span>{t('nav.places')}</span></button>
      <button type="button" className={tabClass(tripPlanningActive)} aria-pressed={tripPlanningActive} onClick={onOpenTrips}><Route size={17} /><span>{t('nav.trips')}</span></button>
      <div className="map-context-navigation__menu-host">
        <button type="button" className={tabClass(organizationActive)} aria-expanded={openMenu === 'organization'} onClick={() => setOpenMenu((current) => current === 'organization' ? null : 'organization')}><Shapes size={17} /><span>{t('nav.organization')}</span><ChevronDown size={14} /></button>
        {openMenu === 'organization' && <div className="map-context-navigation__menu" role="menu" aria-label={t('nav.organization')}>
          <button type="button" role="menuitem" onClick={() => selectPanel('categories')}><Shapes size={17} /><span>{t('nav.categories')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('tags')}><Tag size={17} /><span>{t('nav.tags')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('statuses')}><CircleDot size={17} /><span>{t('nav.statuses')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('annotation-templates')}><Spline size={17} /><span>{t('nav.annotations')}</span></button>
        </div>}
      </div>
      {hasMoreActions && <div className="map-context-navigation__menu-host map-context-navigation__menu-host--more">
        <button type="button" className="map-context-navigation__tab map-context-navigation__more" aria-label={t('nav.mapActions')} aria-expanded={openMenu === 'more'} onClick={() => setOpenMenu((current) => current === 'more' ? null : 'more')}><Ellipsis size={20} /></button>
        {openMenu === 'more' && <div className="map-context-navigation__menu map-context-navigation__menu--more" role="menu" aria-label={t('nav.mapActions')}>
          {poiMap.can_edit === true && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onSettings() }}><Settings2 size={17} /><span>{t('maps.fields')}</span></button>}
          {poiMap.can_manage_members === true && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onMembers() }}><Users size={17} /><span>{t('maps.members')}</span></button>}
          {poiMap.can_edit === true && poiMap.can_import !== false && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onImport() }}><FileUp size={17} /><span>{t('places.import')}</span></button>}
          {poiMap.can_export !== false && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onExport() }}><Download size={17} /><span>{t('maps.export', { name: poiMap.name })}</span></button>}
        </div>}
      </div>}
    </div>
    <div id="map-context-toolbar-slot" className="map-context-navigation__toolbar-slot map-workspace map-workspace-toolbar-scope" />
  </nav>
}
