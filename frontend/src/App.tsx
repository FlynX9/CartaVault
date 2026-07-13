import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { getAvailableCountries, getMapPlaces } from './api/places'
import { getCountryMapConfig } from './components/countries/countryMapConfig'
import { TopBar } from './components/layout/TopBar'
import { CountryPlaceList } from './components/place-list/CountryPlaceList'
import { MapSidebar } from './components/sidebar/MapSidebar'
import { deriveMapSidebarState, getSidebarPlaceId } from './components/sidebar/sidebarState'
import { MapPage } from './pages/MapPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { CategoriesPage } from './pages/admin/CategoriesPage'
import { TagsPage } from './pages/admin/TagsPage'
import type {
  MapBounds,
  MapFocusRequest,
  MapPlace,
  MapView,
  PlaceMutation,
  PreviewPlace,
} from './types/place'
import { readCountry, withCountry } from './utils/country'

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
  const activeCountry = readCountry(location.search)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW)
  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selectedPlace, setSelectedPlace] = useState<PreviewPlace | null>(null)
  const [countries, setCountries] = useState<string[]>([])
  const [areCountriesLoading, setAreCountriesLoading] = useState(false)
  const [countriesError, setCountriesError] = useState<string | null>(null)
  const [placeListOpen, setPlaceListOpen] = useState(true)
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null)
  const [removedPlaceId, setRemovedPlaceId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mapRefreshVersion, setMapRefreshVersion] = useState(0)
  const requestSequence = useRef(0)
  const focusSequence = useRef(0)
  const previousCountry = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isMapWorkspace) return
    const controller = new AbortController()
    setAreCountriesLoading(true)
    setCountriesError(null)

    void getAvailableCountries(controller.signal)
      .then(setCountries)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setCountriesError(
          error instanceof Error
            ? error.message
            : 'Impossible de charger les pays disponibles.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setAreCountriesLoading(false)
      })

    return () => controller.abort()
  }, [isMapWorkspace, mapRefreshVersion])

  useEffect(() => {
    if (previousCountry.current === activeCountry) return
    const isInitialEmptyCountry = previousCountry.current === undefined && activeCountry === null
    previousCountry.current = activeCountry
    if (isInitialEmptyCountry) return

    setSelectedPlace(null)
    setPlaces([])
    setBounds(null)
    setRemovedPlaceId(null)

    if (activeCountry !== null) {
      setFocusRequest({
        id: ++focusSequence.current,
        view: getCountryMapConfig(activeCountry),
      })
    }
  }, [activeCountry])

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
            country: activeCountry ?? undefined,
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

          return visiblePlaces.find((place) => place.id === currentPlace.id)
            ?? currentPlace
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
  }, [activeCountry, bounds, isMapWorkspace, mapRefreshVersion])

  const handlePlaceMutated = (_mutation: PlaceMutation) => {
    setSelectedPlace(null)
    setRemovedPlaceId(null)
    setMapRefreshVersion((version) => version + 1)
  }

  const handlePlaceDeleted = (placeId: string) => {
    setPlaces((current) => current.filter((place) => place.id !== placeId))
    setSelectedPlace((current) =>
      current?.id === placeId ? null : current,
    )
    setRemovedPlaceId(placeId)
    setMapRefreshVersion((version) => version + 1)
  }

  const handlePlaceSelect = (place: PreviewPlace) => {
    setSelectedPlace(place)
    if (location.pathname !== '/') {
      navigate(withCountry('/', activeCountry))
    }
    if (place.latitude !== null && place.longitude !== null) {
      setFocusRequest({
        id: ++focusSequence.current,
        view: {
          center: [place.latitude, place.longitude],
          zoom: Math.max(mapView.zoom, 13),
        },
      })
    }
  }

  const handleCountryChange = (country: string | null) => {
    navigate(withCountry(location.pathname, country))
  }

  const sidebarState = deriveMapSidebarState(location.pathname, selectedPlace)
  const closeSidebar = () => {
    setSelectedPlace(null)
    if (location.pathname !== '/') navigate(withCountry('/', activeCountry))
  }

  return (
    <main className="app-shell">
      <TopBar
        isMapWorkspace={isMapWorkspace}
        countries={countries}
        activeCountry={activeCountry}
        areCountriesLoading={areCountriesLoading}
        countriesError={countriesError}
        markerCount={places.length}
        placeListOpen={placeListOpen}
        onCountryChange={handleCountryChange}
        onTogglePlaceList={() => setPlaceListOpen((open) => !open)}
      />

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
              placeListOpen={placeListOpen}
              focusRequest={focusRequest}
              placeList={
                <CountryPlaceList
                  country={activeCountry}
                  selectedPlaceId={getSidebarPlaceId(sidebarState)}
                  refreshVersion={mapRefreshVersion}
                  removedPlaceId={removedPlaceId}
                  onPlaceSelect={handlePlaceSelect}
                />
              }
              sidebar={
                <MapSidebar
                  state={sidebarState}
                  activeCountry={activeCountry}
                  onClose={closeSidebar}
                  onPlaceMutated={handlePlaceMutated}
                  onPlaceDeleted={handlePlaceDeleted}
                />
              }
              onBoundsChange={setBounds}
              onViewChange={setMapView}
              onPlaceSelect={handlePlaceSelect}
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
