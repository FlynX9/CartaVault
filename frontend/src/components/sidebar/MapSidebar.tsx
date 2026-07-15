import { useNavigate } from 'react-router-dom'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { PoiMap } from '../../types/map'
import type { DraftPosition, PlaceMutation } from '../../types/place'
import type { GeocodingResult } from '../../geocoding/types'
import { withMap } from '../../utils/map'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'

interface Props { state: MapSidebarState; activeMapId: string | null; activeStatusId: string | null; maps: PoiMap[]; onClose: () => void; onPlaceMutated: (mutation: PlaceMutation) => void; onPlaceDeleted: (placeId: string) => void; geographicPrefill?: GeocodingResult | null; coordinatePrefill?: Pick<GeocodingResult, 'latitude' | 'longitude'> | null; draftPosition?: DraftPosition | null; onDraftPositionChange?: (position: DraftPosition | null) => void }

export function MapSidebar({ state, activeMapId, activeStatusId, maps, onClose, onPlaceMutated, geographicPrefill = null, coordinatePrefill = null, draftPosition = null, onDraftPositionChange = () => undefined }: Props) {
  const navigate = useNavigate()
  if (state.mode !== 'create' && state.mode !== 'edit') return null
  const cancel = () => { onDraftPositionChange(null); if (state.mode === 'edit') navigate(withMap(`/places/${state.placeId}`, activeMapId, activeStatusId)); else onClose() }
  return <aside className="map-sidebar map-editor-panel" role="dialog" aria-modal="false" aria-label={state.mode === 'create' ? 'Créer un point d’intérêt' : 'Modifier le point d’intérêt'}>
    <SidebarHeader title={state.mode === 'create' ? 'Nouveau POI' : 'Modifier le POI'} onClose={cancel} />
    <div className="sidebar-content"><PlaceEditorPage mode={state.mode} placeId={state.mode === 'edit' ? state.placeId : undefined} activeMapId={activeMapId} activeStatusId={activeStatusId} maps={maps} embedded geographicPrefill={state.mode === 'create' ? geographicPrefill : null} coordinatePrefill={state.mode === 'create' ? coordinatePrefill : null} draftPosition={draftPosition} onDraftPositionChange={onDraftPositionChange} onPlaceMutated={onPlaceMutated} /></div>
  </aside>
}
