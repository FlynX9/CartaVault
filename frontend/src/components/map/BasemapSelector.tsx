import { useState, type FocusEvent } from 'react'
import { Map, Moon, Satellite, Sun, type LucideIcon } from 'lucide-react'

import { AVAILABLE_BASEMAPS, getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  onBasemapChange: (id: BasemapId) => void
  googleSatelliteAvailable?: boolean
  satelliteProvider?: 'stadia' | 'google'
}

const basemapIcons: Record<BasemapId, LucideIcon> = {
  'cartavault-light': Sun,
  'cartavault-dark': Moon,
  satellite: Satellite,
  'google-satellite': Satellite,
  osm: Map,
}

export function BasemapSelector({ activeBasemapId, onBasemapChange, googleSatelliteAvailable = false, satelliteProvider = 'stadia' }: BasemapSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  const activeBasemap = getBasemap(activeBasemapId)
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
    <fieldset
      className={`basemap-selector${expanded ? ' basemap-selector--expanded' : ''}`}
      aria-label="Fond cartographique"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={handleBlur}
    >
      <legend>Fond</legend>
      {expanded && <div className="basemap-selector-options">{[
        ...AVAILABLE_BASEMAPS.filter((basemap) => basemap.id !== 'satellite'),
        ...(satelliteProvider === 'stadia' ? [getBasemap('satellite')] : googleSatelliteAvailable ? [getBasemap('google-satellite')] : []),
      ].filter((basemap, index, items) => basemap.id !== activeBasemapId && items.findIndex((item) => item.id === basemap.id) === index).map((basemap) => renderBasemapButton(basemap, false))}</div>}
      {renderBasemapButton(activeBasemap, true)}
    </fieldset>
  )
}
