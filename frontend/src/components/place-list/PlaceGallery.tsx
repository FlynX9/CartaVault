import { Check, MapPin, Star } from 'lucide-react'
import { useState } from 'react'

import { getPhotoFileUrl } from '../../api/photos'
import type { PlaceDetails } from '../../types/place'
import { getTagColorStyle } from '../../tags/tagColors'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'

interface Props {
  places: PlaceDetails[]
  selectedPlaceId: string | null
  selectedIds: ReadonlySet<string>
  selectionMode: boolean
  tripPlaceIds: Set<string>
  tripPlanningActive: boolean
  onPlaceSelect: (place: PlaceDetails) => void
  onToggleSelected: (placeId: string) => void
}

function GalleryThumbnail({ place, iconId }: { place: PlaceDetails; iconId?: string }) {
  const [failed, setFailed] = useState(false)

  if (place.primary_photo_id && !failed) {
    return <img src={getPhotoFileUrl(place.primary_photo_id)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  }

  return <span className="places-gallery-card__placeholder" style={{ backgroundColor: place.status.color }}><CategoryIconPreview iconId={iconId} size={42} showLabel={false} /></span>
}

export function PlaceGallery({ places, selectedPlaceId, selectedIds, selectionMode, tripPlaceIds, tripPlanningActive, onPlaceSelect, onToggleSelected }: Props) {
  return (
    <ul className="places-gallery" aria-label={`Galerie des lieux, ${places.length} éléments`}>
      {places.map((place) => {
        const primary = place.categories.find((category) => category.is_primary) ?? place.categories[0]
        const inTrip = tripPlaceIds.has(place.id)
        const rating = place.interest_rating == null ? null : place.interest_rating.toFixed(1)
        return (
          <li key={place.id} className={`${place.id === selectedPlaceId ? 'selected' : ''}${inTrip ? ' trip-included' : ''}`}>
            <article className="places-gallery-card">
              <button
                className="places-gallery-card__main"
                type="button"
                draggable={tripPlanningActive}
                aria-label={place.name}
                onDragStart={(event) => {
                  if (!tripPlanningActive) return
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData('application/x-cartavault-place', place.id)
                  event.dataTransfer.setData('text/plain', `place:${place.id}`)
                }}
                onClick={() => onPlaceSelect(place)}
              >
                <span className="places-gallery-card__visual">
                  <GalleryThumbnail place={place} iconId={primary?.icon} />
                  {inTrip && <i className="places-gallery-card__trip-check" title="Déjà présent dans la sortie"><Check size={13} aria-hidden="true" /></i>}
                  {place.is_favorite && <i className="places-gallery-card__favorite"><Star size={14} fill="currentColor" aria-hidden="true" /></i>}
                </span>
                <span className="places-gallery-card__body">
                  <strong title={place.name}>{place.name}</strong>
                  <span className="places-gallery-card__meta"><MapPin size={13} aria-hidden="true" />{place.region || 'Localisation non renseignée'}</span>
                  <span className="places-gallery-card__category" style={{ color: place.status.color }}>
                    <CategoryIconPreview iconId={primary?.icon} size={13} showLabel={false} />
                    {primary?.name ?? place.status.name}
                  </span>
                  <span className="places-gallery-card__footer">
                    <span className="places-gallery-card__tags">{place.tags.slice(0, 2).map((tag) => <i key={tag.id} style={getTagColorStyle(tag.color)}>{tag.name}</i>)}</span>
                    <b style={{ color: place.status.color }} aria-label={rating == null ? 'Aucune note' : `Note ${rating}`}>★ {rating ?? '—'}</b>
                  </span>
                </span>
              </button>
              {selectionMode && <label className="places-gallery-card__select"><input type="checkbox" checked={selectedIds.has(place.id)} onChange={() => onToggleSelected(place.id)} /><span className="visually-hidden">Sélectionner {place.name}</span></label>}
            </article>
          </li>
        )
      })}
    </ul>
  )
}
