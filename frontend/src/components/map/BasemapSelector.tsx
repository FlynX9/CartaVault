import { useState, type FocusEvent } from 'react'
import { Moon, Satellite, Sun, type LucideIcon } from 'lucide-react'

import { getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  onBasemapChange: (id: BasemapId) => void
  googleSatelliteAvailable?: boolean
  offline?: boolean
  classicProvider?: 'osm' | 'stadia' | 'google'
  satelliteProvider?: 'none' | 'stadia' | 'google' | 'mapbox'
}

const basemapIcons: Record<BasemapId, LucideIcon> = {
  'cartavault-light': Sun,
  'cartavault-dark': Moon,
  'stadia-light': Sun,
  'stadia-dark': Moon,
  'google-roadmap': Sun,
  satellite: Satellite,
  'google-satellite': Satellite,
  'mapbox-satellite': Satellite,
  osm: Sun,
}

export function BasemapSelector({ activeBasemapId, onBasemapChange, offline = false, classicProvider = 'osm', satelliteProvider = 'none' }: BasemapSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  if (offline) return null
  const activeBasemap = getBasemap(activeBasemapId)
  const configuredBasemaps = [
    ...(classicProvider === 'stadia' ? [getBasemap('stadia-light'), getBasemap('stadia-dark')] : classicProvider === 'google' ? [getBasemap('google-roadmap')] : [getBasemap('osm')]),
    ...(satelliteProvider === 'stadia' ? [getBasemap('satellite')] : satelliteProvider === 'google' ? [getBasemap('google-satellite')] : satelliteProvider === 'mapbox' ? [getBasemap('mapbox-satellite')] : []),
  ].filter((basemap, index, items) => basemap.enabled && items.findIndex((item) => item.id === basemap.id) === index)
  const visibleBasemaps = configuredBasemaps.some((basemap) => basemap.id === activeBasemapId)
    ? configuredBasemaps
    : [activeBasemap, ...configuredBasemaps].slice(0, Math.max(1, configuredBasemaps.length))
  const selectBasemap = (id: BasemapId) => {
    onBasemapChange(id)
    setExpanded(false)
  }
  const handleBlur = (event: FocusEvent<HTMLFieldSetElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false)
  }
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
      onClick={() => {
        // A tap focuses the fieldset before dispatching click on mobile.
        // Always opening here avoids the former focus/click toggle race that
        // required a second tap before the choices became visible.
        if (active) setExpanded(true)
        else selectBasemap(basemap.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (active) setExpanded(true)
          else selectBasemap(basemap.id)
        }
      }}
    >
      <Icon size={16} aria-hidden="true" /><span className="basemap-selector__label">{basemap.shortLabel}</span>
    </button>
  }

  return (
    <fieldset
      className={`basemap-selector basemap-selector--count-${visibleBasemaps.length}${expanded ? ' basemap-selector--expanded' : ''}`}
      aria-label="Fond cartographique"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={handleBlur}
    >
      <legend>Fond</legend>
      {expanded && <div className="basemap-selector-options">{visibleBasemaps.filter((basemap) => basemap.id !== activeBasemapId).map((basemap) => renderBasemapButton(basemap, false))}</div>}
      {renderBasemapButton(activeBasemap, true)}
    </fieldset>
  )
}
