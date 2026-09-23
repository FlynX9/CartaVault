import { useEffect, useRef, useState } from 'react'
import { IconMapPin2 } from '@tabler/icons-react'
import { CircleDot, Ellipsis, Images, LayoutDashboard, Map as MapIcon, MapPin, Route, Settings2, Shapes, Spline, Tag, Trash2 } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'
import type { NavigationMode } from '../../navigation/navigationMode'
import type { MobileMapNavigationDestination, NavigationProps } from './MainNavigation'
import { closeMobileModalLayers } from './mobileNavigationViewport'

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

interface Props extends NavigationProps {
  navigationMode: NavigationMode
}

export function MobileNavigation({ navigationMode, activePanel, onPanelChange, dashboardActive = false, onOpenDashboard, onMapNavigation, mobileMapTripsOpen = false }: Props) {
  const { t } = useI18n()
  const [plusOpen, setPlusOpen] = useState(false)
  const plusButtonRef = useRef<HTMLButtonElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const globalMode = navigationMode.kind === 'GLOBAL_MODE'
  const mapPlacesActive = activePanel === 'places'
  const mapTripsActive = mobileMapTripsOpen || activePanel === 'trip'
  const mapActive = !mapPlacesActive && !mapTripsActive && !plusOpen

  useEffect(() => {
    if (!plusOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!plusButtonRef.current?.contains(event.target) && !plusMenuRef.current?.contains(event.target)) setPlusOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlusOpen(false)
    }
    const closeOnMobileLayerRequest = () => setPlusOpen(false)
    document.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('cartavault:close-mobile-modal-layers', closeOnMobileLayerRequest)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('cartavault:close-mobile-modal-layers', closeOnMobileLayerRequest)
    }
  }, [plusOpen])

  const selectPanel = (panel: 'maps' | 'media' | 'trash') => {
    closeMobileModalLayers()
    setPlusOpen(false)
    onPanelChange(panel)
  }
  const selectMapDestination = (destination: 'places' | 'map' | 'trips') => {
    if (navigationMode.kind !== 'MAP_MODE') return
    closeMobileModalLayers()
    setPlusOpen(false)
    if (onMapNavigation) {
      onMapNavigation(destination, navigationMode.mapId)
      return
    }
    onPanelChange(destination === 'places' ? 'places' : destination === 'trips' ? 'trips' : null)
  }
  const selectMapAction = (destination: Exclude<MobileMapNavigationDestination, 'places' | 'map' | 'trips'>) => {
    if (navigationMode.kind !== 'MAP_MODE') return
    closeMobileModalLayers()
    setPlusOpen(false)
    onMapNavigation?.(destination, navigationMode.mapId)
  }

  return <nav className="main-navigation cv-main-navigation mobile-navigation is-mobile" data-navigation-mode={navigationMode.kind} data-navigation-map-id={navigationMode.kind === 'MAP_MODE' ? navigationMode.mapId : undefined} aria-label={t('nav.main')}>
    <div className="main-navigation-links cv-main-navigation__items">
      <div className="cv-main-navigation__group">
        {globalMode
          ? <>
            <button type="button" className={navClass(dashboardActive)} aria-label={t('dashboard.nav')} aria-pressed={dashboardActive} onClick={() => { closeMobileModalLayers(); onOpenDashboard?.() }}><LayoutDashboard size={23} /><span>{t('dashboard.nav')}</span></button>
            <button type="button" className={navClass(activePanel === 'maps')} aria-label={t('nav.myMaps')} aria-pressed={activePanel === 'maps'} onClick={() => selectPanel('maps')}><IconMapPin2 className="cv-main-navigation__vault-icon" aria-hidden="true" size={23} stroke={2} /><span>{t('nav.myMaps')}</span></button>
            <button type="button" className={navClass(activePanel === 'media')} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => selectPanel('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
            <button type="button" className={navClass(activePanel === 'trash')} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => selectPanel('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
          </>
          : <>
            <button type="button" className={navClass(mapPlacesActive)} aria-label={t('nav.places')} aria-pressed={mapPlacesActive} onClick={() => selectMapDestination('places')}><MapPin size={23} /><span>{t('nav.places')}</span></button>
            <button type="button" className={navClass(mapActive)} aria-label={t('nav.map')} aria-pressed={mapActive} onClick={() => selectMapDestination('map')}><MapIcon size={23} /><span>{t('nav.map')}</span></button>
            <button type="button" className={navClass(mapTripsActive)} aria-label={t('nav.mapTrips')} aria-pressed={mapTripsActive} onClick={() => selectMapDestination('trips')}><Route size={23} /><span>{t('nav.mapTrips')}</span></button>
             <button ref={plusButtonRef} type="button" className={navClass(plusOpen)} aria-label={t('nav.more')} aria-pressed={plusOpen} aria-expanded={plusOpen} onClick={() => setPlusOpen((open) => !open)}><Ellipsis size={23} /><span>{t('nav.more')}</span></button>
             {plusOpen && <div ref={plusMenuRef} className="cv-main-navigation__organization-menu cv-main-navigation__map-plus-menu" role="menu" aria-label={t('nav.mapActions')} data-map-id={navigationMode.mapId}>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('categories')}><Shapes size={17} aria-hidden="true" /><span>{t('nav.categories')}</span></button>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('tags')}><Tag size={17} aria-hidden="true" /><span>{t('nav.tags')}</span></button>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('statuses')}><CircleDot size={17} aria-hidden="true" /><span>{t('nav.statuses')}</span></button>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('annotations')}><Spline size={17} aria-hidden="true" /><span>{t('nav.annotations')}</span></button>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('media')}><Images size={17} aria-hidden="true" /><span>{t('nav.mapMedia')}</span></button>
               <button type="button" role="menuitem" data-map-id={navigationMode.mapId} onClick={() => selectMapAction('settings')}><Settings2 size={17} aria-hidden="true" /><span>{t('nav.mapSettings')}</span></button>
             </div>}
          </>}
      </div>
    </div>
  </nav>
}
