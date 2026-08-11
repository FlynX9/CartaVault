import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save } from 'lucide-react'
import { PlaceEditorPage } from '../../pages/PlaceEditorPage'
import type { PoiMap } from '../../types/map'
import type { DraftPosition, PlaceMutation } from '../../types/place'
import type { GeocodingResult } from '../../geocoding/types'
import { withMap } from '../../utils/map'
import type { MapSidebarState } from './sidebarState'
import { SidebarHeader } from './SidebarHeader'
import { useConfirmDialog } from '../common/useConfirmDialog'

interface Props { state: MapSidebarState; activeMapId: string | null; activeStatusId: string | null; maps: PoiMap[]; onClose: () => void; onPlaceMutated: (mutation: PlaceMutation) => void; onPlaceDeleted: (placeId: string) => void; geographicPrefill?: GeocodingResult | null; coordinatePrefill?: Pick<GeocodingResult, 'latitude' | 'longitude'> | null; draftPosition?: DraftPosition | null; onDraftPositionChange?: (position: DraftPosition | null) => void }

export function MapSidebar({ state, activeMapId, activeStatusId, maps, onClose, onPlaceMutated, geographicPrefill = null, coordinatePrefill = null, draftPosition = null, onDraftPositionChange = () => undefined }: Props) {
  const navigate = useNavigate()
  const { confirm, confirmationDialog } = useConfirmDialog()
  const [formDirty, setFormDirty] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState(false)
  useEffect(() => {
    const updateUnsavedState = (event: Event) => {
      const detail = (event as CustomEvent<{ formDirty?: boolean; pendingPhotos?: boolean }>).detail
      if (typeof detail.formDirty === 'boolean') setFormDirty(detail.formDirty)
      if (typeof detail.pendingPhotos === 'boolean') setPendingPhotos(detail.pendingPhotos)
    }
    document.addEventListener('cartavault:poi-editor-unsaved', updateUnsavedState)
    return () => document.removeEventListener('cartavault:poi-editor-unsaved', updateUnsavedState)
  }, [])
  if (state.mode !== 'create' && state.mode !== 'edit') return null
  const cancel = async () => {
    if (formDirty || pendingPhotos) {
      const message = formDirty && pendingPhotos
        ? 'Vos modifications et les photos sélectionnées ne sont pas enregistrées. Elles seront perdues si vous fermez.'
        : formDirty
          ? 'Vos modifications ne sont pas enregistrées. Elles seront perdues si vous fermez.'
          : 'Des photos sont sélectionnées mais ne sont pas encore envoyées. Elles seront perdues si vous fermez.'
      if (!await confirm({ title: 'Fermer sans enregistrer ?', message, confirmLabel: 'Fermer sans enregistrer', variant: 'danger' })) return
    }
    onDraftPositionChange(null)
    if (state.mode === 'edit') navigate(withMap(`/places/${state.placeId}`, activeMapId, activeStatusId)); else onClose()
  }
  return <aside className="map-sidebar map-editor-panel" role="dialog" aria-modal="false" aria-label={state.mode === 'create' ? 'Créer un point d’intérêt' : 'Modifier le point d’intérêt'}>
    <SidebarHeader title={state.mode === 'create' ? 'Nouveau POI' : 'Modifier le POI'} onClose={cancel} actions={state.mode === 'edit' ? <button className="poi-editor-save" type="submit" form="poi-edit-form" aria-label="Enregistrer les modifications" title="Enregistrer les modifications"><Save aria-hidden="true" size={17} /></button> : null} />
    <div className="sidebar-content"><PlaceEditorPage mode={state.mode} placeId={state.mode === 'edit' ? state.placeId : undefined} activeMapId={activeMapId} activeStatusId={activeStatusId} maps={maps} embedded formId={state.mode === 'edit' ? 'poi-edit-form' : undefined} hideSubmit={state.mode === 'edit'} geographicPrefill={state.mode === 'create' ? geographicPrefill : null} coordinatePrefill={state.mode === 'create' ? coordinatePrefill : null} draftPosition={draftPosition} onDraftPositionChange={onDraftPositionChange} onPlaceMutated={onPlaceMutated} /></div>
    {confirmationDialog}
  </aside>
}
