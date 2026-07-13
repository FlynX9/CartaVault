import { useEffect, useRef, useState } from 'react'

import { getMapPlaces } from './api/places'
import { PoiMap } from './components/map/PoiMap'
import { PlacePreview } from './components/places/PlacePreview'
import type { MapBounds, MapPlace } from './types/place'

const REQUEST_DEBOUNCE_MS = 350
const MAP_MARKER_LIMIT = 1000

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function App() {
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    if (bounds === null) {
      return
    }

    const controller = new AbortController()
    const sequence = ++requestSequence.current

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const visiblePlaces = await getMapPlaces(
          {
            bounds,
            limit: MAP_MARKER_LIMIT,
          },
          controller.signal,
        )

        if (sequence !== requestSequence.current) {
          return
        }

        setPlaces(visiblePlaces)
        setSelectedPlace((currentPlace) => {
          if (currentPlace === null) {
            return null
          }

          return (
            visiblePlaces.find((place) => place.id === currentPlace.id) ?? null
          )
        })
      } catch (error) {
        if (isAbortError(error) || sequence !== requestSequence.current) {
          return
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Une erreur inattendue empêche le chargement des POI.',
        )
      } finally {
        if (sequence === requestSequence.current) {
          setIsLoading(false)
        }
      }
    }, REQUEST_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [bounds])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">Carte des points d'intérêt</p>
          <h1>POI Manager</h1>
        </div>
        <div className="marker-count" aria-live="polite">
          <strong>{places.length}</strong>
          <span>marqueur{places.length > 1 ? 's' : ''} visible{places.length > 1 ? 's' : ''}</span>
        </div>
      </header>

      <section className="map-layout" aria-label="Carte des points d'intérêt">
        <PoiMap
          places={places}
          selectedPlaceId={selectedPlace?.id ?? null}
          onBoundsChange={setBounds}
          onPlaceSelect={setSelectedPlace}
        />

        {isLoading && (
          <div className="status-banner loading-status" role="status">
            <span className="loading-dot" aria-hidden="true" />
            Chargement des POI…
          </div>
        )}

        {errorMessage !== null && (
          <div className="status-banner error-status" role="alert">
            <strong>Impossible de charger la carte.</strong>
            <span>{errorMessage}</span>
          </div>
        )}

        {selectedPlace !== null && (
          <PlacePreview
            place={selectedPlace}
            onClose={() => setSelectedPlace(null)}
          />
        )}
      </section>
    </main>
  )
}

export default App
