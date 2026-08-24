import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

import { getPlaceDetails } from '../../api/places'
import type { PlaceDetails } from '../../types/place'
import { PlaceMapPopup } from '../map-popup/PlaceMapPopup'
import { PlaceInlineThumbnailGallery } from '../place-list/PlaceInlineThumbnailGallery'

interface Props {
  placeId: string
  canEdit: boolean
  onEdit: () => void
  onUpdated: () => void
  onDeleted: (placeId: string) => void
  onClose: () => void
}

/** Reuses the full inline Places-card composition in the detached timeline window. */
export function TimelinePlaceDetail({ placeId, canEdit, onEdit, onUpdated, onDeleted, onClose }: Props) {
  const [place, setPlace] = useState<PlaceDetails | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setPlace(null)
    void getPlaceDetails(placeId, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setPlace(loaded)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [placeId])

  if (!place) return <div className="timeline-place-detail" role="status">Chargement du POI…</div>

  const primaryCategory = place.categories.find((category) => category.is_primary)
  return <div className="places-place-card-row timeline-place-detail" data-panel-fit-ready>
    <div data-panel-drag-handle>
      <PlaceInlineThumbnailGallery placeId={place.id} placeName={place.name} statusColor={place.status.color} categoryIcon={primaryCategory?.icon} />
    </div>
    <button className="popup-inline-close" type="button" aria-label="Fermer la fiche" title="Fermer" onClick={onClose}><X size={16} aria-hidden="true" /></button>
    <div className="timeline-place-detail__title"><strong>{place.name}</strong></div>
    <div className="place-inline-details" role="region" aria-label={`Détails de ${place.name}`}>
      <PlaceMapPopup
        placeId={place.id}
        variant="inline"
        initialPlace={place}
        canEdit={canEdit}
        allowPhotoPaste={false}
        showManagementActions
        onUpdated={() => onUpdated()}
        onEdit={onEdit}
        onDeleted={onDeleted}
        onClose={onClose}
      />
    </div>
  </div>
}
