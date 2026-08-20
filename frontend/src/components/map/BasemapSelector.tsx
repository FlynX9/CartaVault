import { useState } from 'react'
import { Moon, Satellite, Sun, type LucideIcon } from 'lucide-react'

import { getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  mapTheme: 'light' | 'dark'
  onBasemapChange: (id: BasemapId) => void
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  googleSatelliteAvailable?: boolean
  offline?: boolean
  classicProvider?: 'cartavault' | 'osm' | 'stadia' | 'google'
  satelliteProvider?: 'none' | 'stadia' | 'google' | 'mapbox'
  googleSatelliteMode?: 'maps-js' | 'map-tiles'
}

const basemapIcons: Record<BasemapId, LucideIcon> = {
  'cartavault-light': Sun,
  'cartavault-dark': Moon,
  'stadia-light': Sun,
  'stadia-dark': Moon,
  'google-roadmap': Sun,
  satellite: Satellite,
  'google-satellite': Satellite,
  'google-satellite-tiles': Satellite,
  'mapbox-satellite': Satellite,
  osm: Sun,
}

export function BasemapSelector({ activeBasemapId, mapTheme, onBasemapChange, expanded: controlledExpanded, onExpandedChange, offline = false, classicProvider = 'osm', satelliteProvider = 'none', googleSatelliteMode = 'maps-js' }: BasemapSelectorProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded
  if (offline) return null
  const activeBasemap = getBasemap(activeBasemapId)
  const configuredBasemaps = [
    ...(classicProvider === 'cartavault'
      ? [getBasemap('cartavault-light'), getBasemap('cartavault-dark')]
      : classicProvider === 'stadia'
      ? [getBasemap('stadia-light'), getBasemap('stadia-dark')]
      : classicProvider === 'google'
        ? [getBasemap('google-roadmap')]
        : [getBasemap('osm')]),
    ...(satelliteProvider === 'stadia' ? [getBasemap('satellite')] : satelliteProvider === 'google' ? [getBasemap(googleSatelliteMode === 'map-tiles' ? 'google-satellite-tiles' : 'google-satellite')] : satelliteProvider === 'mapbox' ? [getBasemap('mapbox-satellite')] : []),
  ].filter((basemap, index, items) => basemap.enabled && items.findIndex((item) => item.id === basemap.id) === index)
  const visibleBasemaps = configuredBasemaps
  const selectBasemap = (id: BasemapId) => {
    onBasemapChange(id)
    setExpanded(false)
  }
  const ActiveIcon = activeBasemap.id === 'satellite' || activeBasemap.id === 'google-satellite' || activeBasemap.id === 'google-satellite-tiles' || activeBasemap.id === 'mapbox-satellite'
    ? Satellite
    : mapTheme === 'dark' ? Moon : Sun
  const renderBasemapButton = (basemap: typeof activeBasemap, active: boolean) => {
    const Icon = basemapIcons[basemap.id]
    return <button
      key={basemap.id}
      type="button"
      className={active ? 'active' : undefined}
      aria-pressed={active}
      aria-expanded={active ? expanded : undefined}
      aria-label={`Utiliser le fond ${basemap.label}`}
      title={basemap.label}
      onPointerDown={(event) => {
        // The toolbar closes popovers from a document-level pointerdown
        // listener. Apply the choice before that listener can unmount the
        // option and swallow the subsequent click.
        event.stopPropagation()
        selectBasemap(basemap.id)
      }}
      onClick={() => selectBasemap(basemap.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectBasemap(basemap.id)
        }
      }}
    >
      <Icon size={16} aria-hidden="true" /><span className="basemap-selector__label">{basemap.shortLabel}</span>
    </button>
  }

  return (
    <section
      className={`basemap-selector basemap-selector--count-${visibleBasemaps.length}${expanded ? ' basemap-selector--expanded' : ''}`}
      aria-label="Fond cartographique"
      onMouseEnter={() => { if (controlledExpanded === undefined) setUncontrolledExpanded(true) }}
      onFocus={() => { if (controlledExpanded === undefined) setUncontrolledExpanded(true) }}
    >
      <button
        type="button"
        className="basemap-selector__toggle"
        aria-expanded={expanded}
        aria-label="Thème de carte"
        title="Thème de carte"
        onClick={() => setExpanded(!expanded)}
      >
        <ActiveIcon size={18} aria-hidden="true" />
      </button>
      {expanded && <div className="basemap-selector-options">{visibleBasemaps.map((basemap) => renderBasemapButton(basemap, basemap.id === activeBasemapId))}</div>}
    </section>
  )
}
