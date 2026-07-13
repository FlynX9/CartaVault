import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'

import { getMapPlaces } from './api/places'
import { MapPage } from './pages/MapPage'
import { PlaceDetailsPage } from './pages/PlaceDetailsPage'
import type { MapBounds, MapPlace, MapView } from './types/place'

const REQUEST_DEBOUNCE_MS = 350
const MAP_MARKER_LIMIT = 1000
const INITIAL_MAP_VIEW: MapView = {
  center: [48.17, 6.45],
  zoom: 9,
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function App() {
  const location = useLocation()
  const isMapRoute = location.pathname === '/'
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW)
  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    if (!isMapRoute || bounds === null) {
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
  }, [bounds, isMapRoute])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">
            {isMapRoute ? "Carte des points d'intérêt" : "Fiche du point d'intérêt"}
          </p>
          <h1>POI Manager</h1>
        </div>
        {isMapRoute ? (
          <div className="marker-count" aria-live="polite">
            <strong>{places.length}</strong>
            <span>
              marqueur{places.length > 1 ? 's' : ''} visible
              {places.length > 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <span className="read-only-label">Lecture seule</span>
        )}
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <MapPage
              places={places}
              selectedPlace={selectedPlace}
              initialView={mapView}
              isLoading={isLoading}
              errorMessage={errorMessage}
              onBoundsChange={setBounds}
              onViewChange={setMapView}
              onPlaceSelect={setSelectedPlace}
              onPlaceClose={() => setSelectedPlace(null)}
            />
          }
        />
        <Route path="/places/:placeId" element={<PlaceDetailsPage />} />
      </Routes>
    </main>
  )
}

export default App
