import { useEffect, useMemo, useRef, useState } from 'react'

import { getPlaces } from '../../api/places'
import type { PlaceDetails, PreviewPlace } from '../../types/place'

const PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 300

interface CountryPlaceListProps {
  country: string | null
  selectedPlaceId: string | null
  refreshVersion: number
  removedPlaceId: string | null
  onPlaceSelect: (place: PreviewPlace) => void
}

function sortPlaces(places: PlaceDetails[]): PlaceDetails[] {
  return [...places].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, 'fr', {
      sensitivity: 'base',
    })
    return byName || left.id.localeCompare(right.id)
  })
}

export function CountryPlaceList({
  country,
  selectedPlaceId,
  refreshVersion,
  removedPlaceId,
  onPlaceSelect,
}: CountryPlaceListProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [places, setPlaces] = useState<PlaceDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (country === null) {
      setPlaces([])
      setIsLoading(false)
      setHasMore(false)
      setErrorMessage(null)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)

    void getPlaces(
      {
        country,
        q: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      },
      controller.signal,
    )
      .then((page) => {
        setPlaces(page)
        setHasMore(page.length === PAGE_SIZE)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setPlaces([])
        setHasMore(false)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Impossible de charger les POI de ce pays.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [country, debouncedSearch, refreshVersion])

  const visiblePlaces = useMemo(
    () => sortPlaces(places.filter((place) => place.id !== removedPlaceId)),
    [places, removedPlaceId],
  )

  useEffect(() => {
    if (selectedPlaceId === null) return
    itemRefs.current.get(selectedPlaceId)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedPlaceId, visiblePlaces])

  const loadMore = async () => {
    if (country === null || isLoadingMore) return
    setIsLoadingMore(true)
    setErrorMessage(null)

    try {
      const page = await getPlaces({
        country,
        q: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: places.length,
      })
      setPlaces((current) => [...current, ...page])
      setHasMore(page.length === PAGE_SIZE)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de charger la page suivante.',
      )
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <aside className="country-place-panel" id="country-place-list" aria-labelledby="country-place-list-title">
      <header className="place-list-header">
        <div>
          <p className="place-list-kicker">Exploration</p>
          <h2 id="country-place-list-title">
            {country ?? 'Points d’intérêt'}
          </h2>
        </div>
        <span className="place-list-count" aria-live="polite">
          {visiblePlaces.length} chargé{visiblePlaces.length > 1 ? 's' : ''}
        </span>
      </header>

      {country !== null && (
        <label className="place-list-search">
          <span>Rechercher un POI</span>
          <span className="place-list-search-control">
            <input
              type="search"
              value={search}
              placeholder={`Rechercher en ${country}`}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche">
                ×
              </button>
            )}
          </span>
        </label>
      )}

      <div className="place-list-body">
        {country === null && (
          <p className="place-list-message">Sélectionnez un pays pour afficher ses POI.</p>
        )}
        {isLoading && <p className="place-list-message" role="status">Chargement des POI…</p>}
        {errorMessage && <p className="place-list-message error" role="alert">{errorMessage}</p>}
        {!isLoading && country !== null && errorMessage === null && visiblePlaces.length === 0 && (
          <p className="place-list-message">
            {debouncedSearch ? 'Aucun POI ne correspond à cette recherche.' : 'Aucun POI pour ce pays.'}
          </p>
        )}

        {visiblePlaces.length > 0 && (
          <ul className="country-place-list">
            {visiblePlaces.map((place) => {
              const isSelected = place.id === selectedPlaceId
              return (
                <li key={place.id}>
                  <button
                    ref={(node) => {
                      if (node) itemRefs.current.set(place.id, node)
                      else itemRefs.current.delete(place.id)
                    }}
                    type="button"
                    className={`place-list-item${isSelected ? ' selected' : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onPlaceSelect(place)}
                  >
                    <strong>{place.name}</strong>
                    {place.categories.length > 0 && (
                      <span>{place.categories.slice(0, 2).map((category) => category.name).join(' · ')}</span>
                    )}
                    {(place.latitude === null || place.longitude === null) && (
                      <span>Coordonnées indisponibles</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {hasMore && (
          <button className="place-list-more" type="button" disabled={isLoadingMore} onClick={() => void loadMore()}>
            {isLoadingMore ? 'Chargement…' : 'Charger plus'}
          </button>
        )}
      </div>
    </aside>
  )
}
