import { Link } from 'react-router-dom'

import type { PreviewPlace } from '../../types/place'
import { withMap } from '../../utils/map'
import { buildGoogleMapsUrl } from '../../utils/googleMaps'

interface PlacePreviewProps {
  place: PreviewPlace
  activeMapId?: string | null
  onClose?: () => void
  embedded?: boolean
}

export function PlacePreview({ place, activeMapId = null, onClose, embedded = false }: PlacePreviewProps) {
  const googleMapsUrl = buildGoogleMapsUrl(place.latitude, place.longitude)

  return (
    <article className={`place-preview${embedded ? ' embedded' : ''}`} aria-label={`Aperçu de ${place.name}`}>
      <div className="preview-heading">
        <div>
          <p className="preview-kicker">Point d'intérêt</p>
          <h2>{place.name}</h2>
        </div>
        {onClose && (
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer la fiche">×</button>
        )}
      </div>

      {place.latitude !== null && place.longitude !== null ? (
        <p className="coordinates">
          {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
        </p>
      ) : (
        <p className="coordinates">Coordonnées indisponibles</p>
      )}

      <section className="preview-section">
        <h3>Catégories</h3>
        {place.categories.length > 0 ? (
          <ul className="chip-list">
            {place.categories.map((category) => (
              <li className="chip" key={category.id}>
                {category.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-label">Aucune catégorie</p>
        )}
      </section>

      {googleMapsUrl && (
        <a className="external-map-link" href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir {place.name} dans Google Maps
        </a>
      )}

      <section className="preview-section">
        <h3>Tags</h3>
        {place.tags.length > 0 ? (
          <ul className="chip-list">
            {place.tags.map((tag) => (
              <li className="chip tag" key={tag.id}>
                {tag.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-label">Aucun tag</p>
        )}
      </section>

      <Link
        className="details-button"
        to={withMap(`/places/${place.id}`, activeMapId)}
        state={{ fromMap: true }}
      >
        Fiche
      </Link>
    </article>
  )
}
