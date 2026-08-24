import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleDot, Download, Ellipsis, FileUp, HardDriveDownload, ListFilter, Map as MapIcon, MapPin, Route, Settings2, Shapes, Spline, SquareDashed, Tag, Users } from 'lucide-react'
import { IconTimelineEvent } from '@tabler/icons-react'

import { useI18n } from '../../i18n/useI18n'
import { listAccessibleTrips } from '../../api/trips'
import { CountryFlag } from '../maps/CountryFlag'
import type { PoiMap } from '../../types/map'
import type { TripListItem } from '../../types/trip'
import type { WorkspacePanel } from './MainNavigation'
import { ActionHistoryControls, ActionHistoryKeyboardShortcuts } from './ActionHistoryControls'

export interface TripTechnicalActions {
  exportTrip: () => void
  makeOffline: () => void
  toggleSettings: () => void
}

interface Props {
  poiMap: PoiMap
  maps: PoiMap[]
  activePanel: WorkspacePanel
  tripPlanningActive: boolean
  tripScreenActive?: boolean
  activeTrip?: { id: string; name: string } | null
  onTripSelect?: (tripId: string) => void
  tripScreenPanels?: { places: boolean; trip: boolean }
  tripTimelineActive?: boolean
  tripTimelineAvailable?: boolean
  mapToolsPanelOpen?: boolean
  legendPanelOpen?: boolean
  countryMaskEnabled?: boolean
  onMapChange: (mapId: string) => void
  onPanelChange: (panel: WorkspacePanel) => void
  onOpenTrips?: () => void
  onTripTimelineToggle?: () => void
  onTripScreenPanelChange?: (panel: 'places' | 'trip') => void
  onImport: () => void
  onExport: () => void
  onSettings: () => void
  onMembers: () => void
  onMapToolsPanelToggle?: () => void
  onLegendPanelToggle?: () => void
  onCountryMaskToggle?: () => void
  tripTechnicalActions?: TripTechnicalActions | null
}

function tabClass(active: boolean, panelToggle = false): string {
  return `map-context-navigation__tab${panelToggle ? ' map-context-navigation__tab--panel-toggle' : ''}${active ? ' is-active' : ''}`
}

export function MapContextNavigation({ poiMap, maps, activePanel, tripPlanningActive, tripScreenActive = false, activeTrip = null, onTripSelect = () => undefined, tripScreenPanels = { places: false, trip: true }, tripTimelineActive = false, tripTimelineAvailable = poiMap.trip_count > 0, mapToolsPanelOpen = false, legendPanelOpen = false, countryMaskEnabled = true, onMapChange, onPanelChange, onTripTimelineToggle = () => undefined, onTripScreenPanelChange = () => undefined, onImport, onExport, onSettings, onMembers, onMapToolsPanelToggle = () => undefined, onLegendPanelToggle = () => undefined, onCountryMaskToggle = () => undefined, tripTechnicalActions = null }: Props) {
  const { t } = useI18n()
  const [openMenu, setOpenMenu] = useState<'maps' | 'organization' | 'more' | null>(null)
  const navigationRef = useRef<HTMLElement>(null)
  const mapSwitcherRef = useRef<HTMLDivElement>(null)
  const organizationRef = useRef<HTMLDivElement>(null)
  const moreActionsRef = useRef<HTMLDivElement>(null)
  const [trips, setTrips] = useState<TripListItem[]>([])

  useEffect(() => {
    if (!tripScreenActive || !activeTrip) { setTrips([]); return }
    const controller = new AbortController()
    void listAccessibleTrips(controller.signal).then(setTrips).catch(() => undefined)
    return () => controller.abort()
  }, [activeTrip?.id, tripScreenActive])

  useEffect(() => {
    if (openMenu === null) return
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
       const activeHost = openMenu === 'maps' ? mapSwitcherRef.current : openMenu === 'organization' ? organizationRef.current : moreActionsRef.current
      if (!activeHost?.contains(event.target)) setOpenMenu(null)
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

  const placesActive = tripScreenPanels.places
  const placesDisplayed = placesActive && !tripTimelineActive
  const organizationActive = activePanel === 'categories' || activePanel === 'tags' || activePanel === 'statuses' || activePanel === 'annotation-templates'
  const selectPanel = (panel: WorkspacePanel) => { setOpenMenu(null); onPanelChange(panel) }

  return <nav ref={navigationRef} className={`map-context-navigation${activePanel === null ? ' is-map-only' : ''}`} aria-label={t('nav.mapContext')}>
    <ActionHistoryKeyboardShortcuts />
    <div className="map-context-navigation__identity">
      <div ref={mapSwitcherRef} className="map-context-navigation__menu-host map-context-navigation__map-switcher">
        <button type="button" className="map-context-navigation__map-trigger" aria-label={tripScreenActive && activeTrip ? t('trips.select') : t('nav.chooseMap')} aria-haspopup="listbox" aria-expanded={openMenu === 'maps'} onClick={() => setOpenMenu((current) => current === 'maps' ? null : 'maps')}>
          <CountryFlag countryCode={poiMap.country.iso_alpha2} className="map-context-navigation__map-flag" fallbackSize={18} />
          <span className="map-context-navigation__map-copy"><strong>{tripScreenActive && activeTrip ? activeTrip.name : poiMap.name}</strong><small>{tripScreenActive && activeTrip ? poiMap.name : poiMap.country.name}</small></span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {openMenu === 'maps' && <div className="map-context-navigation__menu map-context-navigation__map-menu" role="listbox" aria-label={tripScreenActive && activeTrip ? t('trips.select') : t('nav.chooseMap')}>
          {tripScreenActive && activeTrip ? (trips.length > 0 ? trips : [{ id: activeTrip.id, map_id: poiMap.id, map_name: poiMap.name, country_name: poiMap.country.name, country_code: poiMap.country.iso_alpha2, name: activeTrip.name }]).map((trip) => <button type="button" role="option" aria-selected={trip.id === activeTrip.id} key={trip.id} onClick={() => { setOpenMenu(null); if (trip.id !== activeTrip.id) onTripSelect(trip.id) }}>
            <CountryFlag countryCode={trip.country_code} className="map-context-navigation__map-flag" fallbackSize={18} />
            <span className="map-context-navigation__map-copy"><strong>{trip.name}</strong><small>{trip.map_name}</small></span>
          </button>) : maps.map((map) => <button type="button" role="option" aria-selected={map.id === poiMap.id} key={map.id} onClick={() => { setOpenMenu(null); if (map.id !== poiMap.id) onMapChange(map.id) }}>
            <CountryFlag countryCode={map.country.iso_alpha2} className="map-context-navigation__map-flag" fallbackSize={18} />
            <span className="map-context-navigation__map-copy"><strong>{map.name}</strong><small>{map.country.name}</small></span>
          </button>)}
        </div>}
      </div>
    </div>
    <div className="map-context-navigation__tabs">
      {tripScreenActive && <>
        <button type="button" className={tabClass(placesDisplayed, true)} aria-pressed={placesDisplayed} onClick={() => onTripScreenPanelChange('places')}><MapPin size={17} /><span>{t('nav.places')}</span></button>
        <button type="button" className={tabClass(tripTimelineActive ? false : tripScreenPanels.trip, true)} aria-pressed={tripTimelineActive ? false : tripScreenPanels.trip} onClick={() => onTripScreenPanelChange('trip')}><Route size={17} /><span>{t('trips.tab')}</span></button>
        {tripTimelineAvailable && <button type="button" className={tabClass(tripTimelineActive, true)} aria-pressed={tripTimelineActive} onClick={onTripTimelineToggle}><IconTimelineEvent size={17} stroke={2} aria-hidden="true" /><span>{t('trips.timeline')}</span></button>}
      </>}
    </div>
    <div className="map-context-navigation__view-controls">
      {!tripScreenActive && <div ref={organizationRef} className="map-context-navigation__menu-host map-context-navigation__organization-switcher">
        <button type="button" className={`map-context-navigation__organization-trigger${organizationActive ? ' is-active' : ''}`} aria-label={t('nav.organization')} aria-expanded={openMenu === 'organization'} onClick={() => setOpenMenu((current) => current === 'organization' ? null : 'organization')}>
          <Shapes size={18} aria-hidden="true" /><span>{t('nav.organization')}</span><ChevronDown className="map-context-navigation__organization-chevron" size={16} aria-hidden="true" />
        </button>
        {openMenu === 'organization' && <div className="map-context-navigation__menu map-context-navigation__organization-menu" role="menu" aria-label={t('nav.organization')}>
          <button type="button" role="menuitem" onClick={() => selectPanel('categories')}><Shapes size={17} /><span>{t('nav.categories')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('tags')}><Tag size={17} /><span>{t('nav.tags')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('statuses')}><CircleDot size={17} /><span>{t('nav.statuses')}</span></button>
          <button type="button" role="menuitem" onClick={() => selectPanel('annotation-templates')}><Spline size={17} /><span>{t('nav.annotations')}</span></button>
        </div>}
      </div>}
      <div id="map-context-toolbar-slot" className="map-context-navigation__toolbar-slot map-workspace map-workspace-toolbar-scope" />
    </div>
    <div ref={moreActionsRef} className="map-context-navigation__menu-host map-context-navigation__menu-host--more">
      <button type="button" className="map-context-navigation__tab map-context-navigation__more" aria-label={t('nav.mapActions')} aria-expanded={openMenu === 'more'} onClick={() => setOpenMenu((current) => current === 'more' ? null : 'more')}><Ellipsis size={20} /></button>
      {openMenu === 'more' && <div className="map-context-navigation__menu map-context-navigation__menu--more" role="menu" aria-label={t('nav.mapActions')}>
        <div className="map-context-navigation__menu-section map-context-navigation__menu-section--first" role="presentation">Outils</div>
        <ActionHistoryControls menu />
        <button type="button" className={`map-context-navigation__toggle-action${mapToolsPanelOpen ? ' is-active' : ''}`} role="menuitemcheckbox" aria-checked={mapToolsPanelOpen} onClick={onMapToolsPanelToggle}><MapIcon size={17} /><span>{t('map.tools.title')}</span><i aria-hidden="true"><b /></i></button>
        <button type="button" className={`map-context-navigation__toggle-action${legendPanelOpen ? ' is-active' : ''}`} role="menuitemcheckbox" aria-checked={legendPanelOpen} onClick={onLegendPanelToggle}><ListFilter size={17} /><span>{t('map.legend.title')}</span><i aria-hidden="true"><b /></i></button>
        <button type="button" className={`map-context-navigation__toggle-action${countryMaskEnabled ? ' is-active' : ''}`} role="menuitemcheckbox" aria-checked={countryMaskEnabled} onClick={onCountryMaskToggle}><SquareDashed size={17} /><span>Masque de pays</span><i aria-hidden="true"><b /></i></button>
        <div className="map-context-navigation__menu-section" role="presentation">Carte</div>
        {poiMap.can_edit === true && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onSettings() }}><Settings2 size={17} /><span>{t('maps.fields')}</span></button>}
        {poiMap.can_manage_members === true && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onMembers() }}><Users size={17} /><span>{t('maps.members')}</span></button>}
        {poiMap.can_edit === true && poiMap.can_import !== false && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onImport() }}><FileUp size={17} /><span>{t('places.import')}</span></button>}
        {poiMap.can_export !== false && <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); onExport() }}><Download size={17} /><span>{t('maps.export', { name: poiMap.name })}</span></button>}
        {tripPlanningActive && tripTechnicalActions && <>
          <div className="map-context-navigation__menu-section" role="presentation">Sortie</div>
          <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); tripTechnicalActions.exportTrip() }}><Download size={17} /><span>Exporter la sortie</span></button>
          <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); tripTechnicalActions.makeOffline() }}><HardDriveDownload size={17} /><span>Mettre hors ligne</span></button>
          <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); tripTechnicalActions.toggleSettings() }}><Settings2 size={17} /><span>Paramètres de la sortie</span></button>
        </>}
      </div>}
    </div>
  </nav>
}
