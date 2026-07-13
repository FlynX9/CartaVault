import { useNavigate } from 'react-router-dom'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { PoiMap } from '../../types/map'
import type { PlaceMutation } from '../../types/place'
import { withMap } from '../../utils/map'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'

interface Props { state: MapSidebarState; activeMapId: string | null; activeStatusId: string | null; maps: PoiMap[]; onClose: () => void; onPlaceMutated: (mutation: PlaceMutation) => void; onPlaceDeleted: (placeId: string) => void }

export function MapSidebar({ state, activeMapId, activeStatusId, maps, onClose, onPlaceMutated }: Props) {
  const navigate = useNavigate()
  if (state.mode !== 'create' && state.mode !== 'edit') return null
  const cancel = () => state.mode === 'edit' ? navigate(withMap(`/places/${state.placeId}`, activeMapId, activeStatusId)) : onClose()
  return <aside className="map-sidebar map-editor-panel" role="dialog" aria-modal="false" aria-label={state.mode === 'create' ? 'Créer un point d’intérêt' : 'Modifier le point d’intérêt'}>
    <SidebarHeader title={state.mode === 'create' ? 'Nouveau POI' : 'Modifier le POI'} onClose={cancel} onBack={state.mode === 'edit' ? cancel : undefined} />
    <div className="sidebar-content"><PlaceEditorPage mode={state.mode} placeId={state.mode === 'edit' ? state.placeId : undefined} activeMapId={activeMapId} activeStatusId={activeStatusId} maps={maps} embedded onPlaceMutated={onPlaceMutated} /></div>
  </aside>
}
