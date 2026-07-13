import { useNavigate } from 'react-router-dom'

import { PlacePreview } from '../places/PlacePreview'
import { PlaceDetailsPage } from '../../pages/PlaceDetailsPage'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'

interface MapSidebarProps {
  state: MapSidebarState
  onClose: () => void
  onPlaceMutated: () => void
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
            ? () => navigate(`/places/${state.placeId}`)
            : undefined
        }
      />
      <div className="sidebar-content">
        {state.mode === 'preview' && <PlacePreview place={state.place} embedded />}
        {state.mode === 'details' && (
          <PlaceDetailsPage
            placeId={state.placeId}
            embedded
            onPlaceDeleted={onPlaceDeleted}
          />
        )}
        {state.mode === 'create' && (
          <PlaceEditorPage
            mode="create"
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
        {state.mode === 'edit' && (
          <PlaceEditorPage
            mode="edit"
            placeId={state.placeId}
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
      </div>
    </aside>
  )
}
