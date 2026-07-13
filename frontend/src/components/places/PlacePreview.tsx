import { Link } from 'react-router-dom'

import type { MapPlace } from '../../types/place'

interface PlacePreviewProps {
  place: MapPlace
  onClose: () => void
}

export function PlacePreview({ place, onClose }: PlacePreviewProps) {
  return (
    <article className="place-preview" aria-label={`Aperçu de ${place.name}`}>
      <div className="preview-heading">
        <div>
          <p className="preview-kicker">Point d'intérêt</p>
          <h2>{place.name}</h2>
        </div>
        <button
          className="close-button"
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche"
        >
          ×
        </button>
      </div>

      <p className="coordinates">
        {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
      </p>

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
        to={`/places/${place.id}`}
        state={{ fromMap: true }}
      >
        Voir la fiche
      </Link>
    </article>
  )
}
