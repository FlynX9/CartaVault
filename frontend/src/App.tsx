import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { getMapPlaces } from './api/places'
import { MapSidebar } from './components/sidebar/MapSidebar'
import { deriveMapSidebarState, getSidebarPlaceId } from './components/sidebar/sidebarState'
import { MapPage } from './pages/MapPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { CategoriesPage } from './pages/admin/CategoriesPage'
import { TagsPage } from './pages/admin/TagsPage'
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
  const navigate = useNavigate()
  const isMapWorkspace = !location.pathname.startsWith('/admin')
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW)
  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mapRefreshVersion, setMapRefreshVersion] = useState(0)
  const requestSequence = useRef(0)

  useEffect(() => {
    if (!isMapWorkspace || bounds === null) {
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
  }, [bounds, isMapWorkspace, mapRefreshVersion])

  const handlePlaceMutated = () => {
    setSelectedPlace(null)
    setMapRefreshVersion((version) => version + 1)
  }

  const handlePlaceDeleted = (placeId: string) => {
    setPlaces((current) => current.filter((place) => place.id !== placeId))
    setSelectedPlace((current) =>
      current?.id === placeId ? null : current,
    )
  }

  const sidebarState = deriveMapSidebarState(location.pathname, selectedPlace)
  const closeSidebar = () => {
    setSelectedPlace(null)
    if (location.pathname !== '/') navigate('/')
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">
            {isMapWorkspace ? "Carte des points d'intérêt" : 'Administration'}
          </p>
          <h1>POI Manager</h1>
        </div>
        <div className="app-header-actions">
          <Link className="header-link" to="/admin/categories">Administration</Link>
          {isMapWorkspace ? (
            <div className="marker-count" aria-live="polite">
              <strong>{places.length}</strong>
              <span>
                marqueur{places.length > 1 ? 's' : ''} visible
                {places.length > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <Link className="header-link" to="/">Carte</Link>
          )}
        </div>
      </header>

      <Routes>
        <Route
          path="*"
          element={
            <MapPage
              places={places}
              selectedPlaceId={getSidebarPlaceId(sidebarState)}
              initialView={mapView}
              isLoading={isLoading}
              errorMessage={errorMessage}
              sidebarOpen={sidebarState.mode !== 'closed'}
              sidebar={
                <MapSidebar
                  state={sidebarState}
                  onClose={closeSidebar}
                  onPlaceMutated={handlePlaceMutated}
                  onPlaceDeleted={handlePlaceDeleted}
                />
              }
              onBoundsChange={setBounds}
              onViewChange={setMapView}
              onPlaceSelect={setSelectedPlace}
            />
          }
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="categories" replace />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="tags" element={<TagsPage />} />
        </Route>
      </Routes>
    </main>
  )
}

export default App
