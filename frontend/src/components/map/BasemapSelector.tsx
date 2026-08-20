import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Layers, Moon, Satellite, Sun, type LucideIcon } from 'lucide-react'

import { getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  mapTheme: 'light' | 'dark'
  onBasemapChange: (id: BasemapId) => void
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  offline?: boolean
  satelliteProvider?: 'none' | 'arcgis' | 'google'
}

const basemapIcons: Partial<Record<BasemapId, LucideIcon>> = {
  'openfreemap-light': Sun,
  'openfreemap-dark': Moon,
  'google-satellite': Satellite,
  'arcgis-satellite': Satellite,
  osm: Sun,
  'offline-vector-light': Sun,
  'offline-vector-dark': Moon,
}

export function BasemapSelector({ activeBasemapId, onBasemapChange, expanded: controlledExpanded, onExpandedChange, offline = false, satelliteProvider = 'arcgis' }: BasemapSelectorProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded
  const selectorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!expanded) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !selectorRef.current?.contains(event.target)) setExpanded(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [expanded, setExpanded])
  if (offline) return null
  const activeBasemap = getBasemap(activeBasemapId)
  const configuredBasemaps = [
    getBasemap('openfreemap-light'),
    getBasemap('openfreemap-dark'),
    ...(satelliteProvider === 'arcgis' ? [getBasemap('arcgis-satellite')] : satelliteProvider === 'google' ? [getBasemap('google-satellite')] : []),
  ].filter((basemap, index, items) => basemap.enabled && items.findIndex((item) => item.id === basemap.id) === index)
  const visibleBasemaps = configuredBasemaps
  const selectBasemap = (id: BasemapId) => {
    onBasemapChange(id)
    setExpanded(false)
  }
  const renderBasemapButton = (basemap: typeof activeBasemap, active: boolean) => {
    const Icon = basemapIcons[basemap.id] ?? Sun
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
      ref={selectorRef}
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
        <Layers size={18} aria-hidden="true" />
        <span>Thème de carte</span>
        <ChevronDown className="basemap-selector__chevron" size={16} aria-hidden="true" />
      </button>
      {expanded && <div className="basemap-selector-options">{visibleBasemaps.map((basemap) => renderBasemapButton(basemap, basemap.id === activeBasemapId))}</div>}
    </section>
  )
}
