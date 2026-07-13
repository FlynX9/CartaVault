import { useNavigate } from 'react-router-dom'

import { PlacePreview } from '../places/PlacePreview'
import { PlaceDetailsPage } from '../../pages/PlaceDetailsPage'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { PlaceMutation } from '../../types/place'
import type { PoiMap } from '../../types/map'
import { withMap } from '../../utils/map'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'

interface MapSidebarProps {
  state: MapSidebarState
  activeMapId: string | null
  maps: PoiMap[]
  onClose: () => void
  onPlaceMutated: (mutation: PlaceMutation) => void
  onPlaceDeleted: (placeId: string) => void
}

function getTitle(state: Exclude<MapSidebarState, { mode: 'closed' }>): string {
  if (state.mode === 'preview') return state.place.name
  if (state.mode === 'details') return 'Fiche du POI'
  if (state.mode === 'create') return 'Nouveau POI'
  return 'Modifier le POI'
}

function getStateKey(state: Exclude<MapSidebarState, { mode: 'closed' }>): string {
  if (state.mode === 'preview') return `${state.mode}-${state.place.id}`
  if (state.mode === 'details' || state.mode === 'edit') {
    return `${state.mode}-${state.placeId}`
  }
  return state.mode
}

export function MapSidebar({
  state,
  activeMapId,
  maps,
  onClose,
  onPlaceMutated,
  onPlaceDeleted,
}: MapSidebarProps) {
  const navigate = useNavigate()
  if (state.mode === 'closed') return null

  return (
    <aside className="map-sidebar" aria-label="Volet du point d’intérêt">
      <SidebarHeader
        key={getStateKey(state)}
        title={getTitle(state)}
        onClose={onClose}
        onBack={
          state.mode === 'edit'
            ? () => navigate(withMap(`/places/${state.placeId}`, activeMapId))
            : undefined
        }
      />
      <div className="sidebar-content">
        {state.mode === 'preview' && (
          <PlacePreview place={state.place} activeMapId={activeMapId} embedded />
        )}
        {state.mode === 'details' && (
          <PlaceDetailsPage
            placeId={state.placeId}
            activeMapId={activeMapId}
            embedded
            onPlaceDeleted={onPlaceDeleted}
          />
        )}
        {state.mode === 'create' && (
          <PlaceEditorPage
            mode="create"
            activeMapId={activeMapId}
            maps={maps}
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
        {state.mode === 'edit' && (
          <PlaceEditorPage
            mode="edit"
            placeId={state.placeId}
            activeMapId={activeMapId}
            maps={maps}
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
      </div>
    </aside>
  )
}
