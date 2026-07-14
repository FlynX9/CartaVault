import { BASEMAPS, type BasemapId } from '../../map/basemaps'

interface BasemapSelectorProps {
  activeBasemapId: BasemapId
  onBasemapChange: (id: BasemapId) => void
}

export function BasemapSelector({ activeBasemapId, onBasemapChange }: BasemapSelectorProps) {
  return (
    <fieldset className="basemap-selector" aria-label="Fond cartographique">
      <legend>Fond</legend>
      <div className="basemap-selector-options">
        {BASEMAPS.map((basemap) => (
          <button
            key={basemap.id}
            type="button"
            className={basemap.id === activeBasemapId ? 'active' : undefined}
            aria-pressed={basemap.id === activeBasemapId}
            aria-label={`Utiliser le fond ${basemap.label}`}
            onClick={() => onBasemapChange(basemap.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onBasemapChange(basemap.id)
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
