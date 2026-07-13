import type { PoiMap } from '../../types/map'

interface MapSelectorProps {
  maps: PoiMap[]
  activeMapId: string | null
  isLoading: boolean
  errorMessage: string | null
  onChange: (mapId: string | null) => void
}

export function MapSelector({ maps, activeMapId, isLoading, errorMessage, onChange }: MapSelectorProps) {
  return (
    <label className="country-selector">
      <span>Carte</span>
      <select value={activeMapId ?? ''} disabled={isLoading} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Choisir une carte</option>
        {maps.map((poiMap) => <option key={poiMap.id} value={poiMap.id}>{poiMap.name} — {poiMap.country.name}</option>)}
      </select>
      {errorMessage && <span className="country-selector-error" role="alert">{errorMessage}</span>}
    </label>
  )
}
