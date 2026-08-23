import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconVault } from '@tabler/icons-react'
import { CircleDot, Images, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Shapes, Spline, Tag, Trash2 } from 'lucide-react'

import { useI18n } from '../../i18n/useI18n'

export type WorkspacePanel = 'maps' | 'places' | 'media' | 'categories' | 'tags' | 'statuses' | 'trash' | 'annotation-templates' | null

interface Props {
  activePanel: WorkspacePanel
  onPanelChange: (panel: WorkspacePanel) => void
  dashboardActive?: boolean
  onOpenDashboard?: () => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

const MOBILE_NAVIGATION_MEDIA_QUERY = '(max-width: 900px), (max-device-width: 900px), (pointer: coarse), (max-aspect-ratio: 3 / 4)'

function navClass(active: boolean): string {
  return active ? 'active cv-main-navigation__item' : 'cv-main-navigation__item'
}

function closeMobileModalLayers() {
  if (window.matchMedia?.('(max-width: 760px)').matches) window.dispatchEvent(new Event('cartavault:close-mobile-modal-layers'))
}

export function MainNavigation({ activePanel, onPanelChange, dashboardActive = false, onOpenDashboard, collapsed = false, onCollapsedChange = () => undefined }: Props) {
  const { t } = useI18n()
  const [isMobileViewport, setIsMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(MOBILE_NAVIGATION_MEDIA_QUERY).matches === true)
  const [organizationOpen, setOrganizationOpen] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY)
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener?.('change', updateViewport)
    return () => mediaQuery.removeEventListener?.('change', updateViewport)
  }, [])

  const mapsActive = !dashboardActive && activePanel !== 'media' && activePanel !== 'trash'
  const selectPanel = (panel: 'maps' | 'media' | 'trash') => {
    closeMobileModalLayers()
    onPanelChange(panel)
  }
  const toggleMobilePlaces = () => {
    closeMobileModalLayers()
    if (isMobileViewport && !dashboardActive && (activePanel === 'places' || activePanel === null)) {
      onPanelChange(activePanel === 'places' ? null : 'places')
      return
    }
    onPanelChange('maps')
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
        <button type="button" className={navClass(mapsActive)} aria-label={t('nav.maps')} aria-pressed={mapsActive} onClick={toggleMobilePlaces}><IconVault className="cv-main-navigation__vault-icon" aria-hidden="true" size={23} stroke={2} /><span>{t('nav.maps')}</span></button>
        <button type="button" className={navClass(activePanel === 'media')} aria-label={t('nav.media')} aria-pressed={activePanel === 'media'} onClick={() => selectPanel('media')}><Images size={23} /><span>{t('nav.media')}</span></button>
      </div>
      <div className="cv-main-navigation__separator" role="separator" />
        <div className="cv-main-navigation__group cv-main-navigation__group--trash">
          <button type="button" className={navClass(activePanel === 'trash')} aria-label={t('nav.trash')} aria-pressed={activePanel === 'trash'} onClick={() => selectPanel('trash')}><Trash2 size={23} /><span>{t('nav.trash')}</span></button>
        </div>
        <div className="cv-main-navigation__organization-mobile">
          <button type="button" className={navClass(activePanel === 'categories' || activePanel === 'tags' || activePanel === 'statuses' || activePanel === 'annotation-templates')} aria-label={t('nav.organization')} aria-expanded={organizationOpen} onClick={() => setOrganizationOpen((open) => !open)}><Shapes size={23} /><span>{t('nav.organization')}</span></button>
          {organizationOpen && <div className="cv-main-navigation__organization-menu" role="menu" aria-label={t('nav.organization')}>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('categories')}><Shapes size={17} /><span>{t('nav.categories')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('tags')}><Tag size={17} /><span>{t('nav.tags')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('statuses')}><CircleDot size={17} /><span>{t('nav.statuses')}</span></button>
            <button type="button" role="menuitem" onClick={() => selectOrganizationPanel('annotation-templates')}><Spline size={17} /><span>{t('nav.annotations')}</span></button>
          </div>}
        </div>
      </div>
  </nav>
}
