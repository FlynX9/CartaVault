import { useState, type FocusEvent } from 'react'

import { AVAILABLE_BASEMAPS, getBasemap, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  onBasemapChange: (id: BasemapId) => void
}

export function BasemapSelector({ activeBasemapId, onBasemapChange }: BasemapSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  const activeBasemap = getBasemap(activeBasemapId)
  const visibleBasemaps = expanded
    ? [activeBasemap, ...AVAILABLE_BASEMAPS.filter((basemap) => basemap.id !== activeBasemapId)]
    : [activeBasemap]
  const selectBasemap = (id: BasemapId) => {
    onBasemapChange(id)
    setExpanded(false)
  }
  const handleBlur = (event: FocusEvent<HTMLFieldSetElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false)
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
      <div className="basemap-selector-options">
        {visibleBasemaps.map((basemap) => (
          <button
            key={basemap.id}
            type="button"
            className={basemap.id === activeBasemapId ? 'active' : undefined}
            aria-pressed={basemap.id === activeBasemapId}
            aria-expanded={basemap.id === activeBasemapId ? expanded : undefined}
            aria-label={`Utiliser le fond ${basemap.label}`}
            onClick={() => selectBasemap(basemap.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                selectBasemap(basemap.id)
              }
            }}
          >
            {basemap.shortLabel}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
