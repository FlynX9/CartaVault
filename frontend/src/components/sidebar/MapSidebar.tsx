import { useNavigate } from 'react-router-dom'

import { PlacePreview } from '../places/PlacePreview'
import { PlaceDetailsPage } from '../../pages/PlaceDetailsPage'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { PlaceMutation } from '../../types/place'
import { withCountry } from '../../utils/country'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'

interface MapSidebarProps {
  state: MapSidebarState
  activeCountry: string | null
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
  activeCountry,
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
            ? () => navigate(withCountry(`/places/${state.placeId}`, activeCountry))
            : undefined
        }
      />
      <div className="sidebar-content">
        {state.mode === 'preview' && (
          <PlacePreview place={state.place} activeCountry={activeCountry} embedded />
        )}
        {state.mode === 'details' && (
          <PlaceDetailsPage
            placeId={state.placeId}
            activeCountry={activeCountry}
            embedded
            onPlaceDeleted={onPlaceDeleted}
          />
        )}
        {state.mode === 'create' && (
          <PlaceEditorPage
            mode="create"
            activeCountry={activeCountry}
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
        {state.mode === 'edit' && (
          <PlaceEditorPage
            mode="edit"
            placeId={state.placeId}
            activeCountry={activeCountry}
            embedded
            onPlaceMutated={onPlaceMutated}
          />
        )}
      </div>
    </aside>
  )
}
