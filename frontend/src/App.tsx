import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from './api/client'
import { deleteMap, getMaps } from './api/maps'
import { getMapPlaces, getPlaceDetails } from './api/places'
import { TopBar } from './components/layout/TopBar'
import { MapPlaceList } from './components/place-list/MapPlaceList'
import { MapSidebar } from './components/sidebar/MapSidebar'
import { PlaceMapPopup } from './components/map-popup/PlaceMapPopup'
import { deriveMapSidebarState, getSidebarPlaceId } from './components/sidebar/sidebarState'
import { MapPage } from './pages/MapPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { CategoriesPage } from './pages/admin/CategoriesPage'
import { TagsPage } from './pages/admin/TagsPage'
import type { PoiMap } from './types/map'
import type { MapBounds, MapFocusRequest, MapPlace, MapView, PlaceMutation, PreviewPlace } from './types/place'
import { readMapId, withMap } from './utils/map'

const REQUEST_DEBOUNCE_MS = 350
const INITIAL_MAP_VIEW: MapView = { center: [48.17, 6.45], zoom: 9 }
const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError'

function App() {
  const location = useLocation(); const navigate = useNavigate(); const isMapWorkspace = !location.pathname.startsWith('/admin')
  const activeMapId = readMapId(location.search)
  const directPlaceId = location.pathname.match(/^\/places\/([^/]+)$/)?.[1] ?? null
  const [maps, setMaps] = useState<PoiMap[]>([]); const activeMap = maps.find((item) => item.id === activeMapId) ?? null
  const [mapsLoading, setMapsLoading] = useState(false); const [mapsError, setMapsError] = useState<string | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null); const [mapView, setMapView] = useState<MapView>(INITIAL_MAP_VIEW)
  const [places, setPlaces] = useState<MapPlace[]>([]); const [selectedPlace, setSelectedPlace] = useState<PreviewPlace | null>(null)
  const [placeListOpen, setPlaceListOpen] = useState(true); const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null)
  const [removedPlaceId, setRemovedPlaceId] = useState<string | null>(null); const [isLoading, setIsLoading] = useState(false); const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0); const requestSequence = useRef(0); const focusSequence = useRef(0); const previousMapConfig = useRef<string | null | undefined>(undefined)

  const loadMaps = useCallback(() => {
    const controller = new AbortController(); setMapsLoading(true); setMapsError(null)
    void getMaps(controller.signal).then((loaded) => {
      setMaps(loaded)
      if (readMapId(location.search) === null && loaded.length > 0) navigate(withMap(location.pathname, loaded[0].id), { replace: true })
    }).catch((error: unknown) => { if (!isAbortError(error)) setMapsError(error instanceof Error ? error.message : 'Impossible de charger les cartes.') }).finally(() => { if (!controller.signal.aborted) setMapsLoading(false) })
    return () => controller.abort()
  }, [location.pathname, location.search, navigate])
  useEffect(() => loadMaps(), [loadMaps, isMapWorkspace, refreshVersion])

  useEffect(() => {
    const configKey = activeMap === null ? null : `${activeMap.id}:${activeMap.effective_center_latitude}:${activeMap.effective_center_longitude}:${activeMap.effective_default_zoom}`
    if (previousMapConfig.current === configKey) return
    previousMapConfig.current = configKey; setSelectedPlace(null); setPlaces([]); setBounds(null); setRemovedPlaceId(null)
    if (activeMap) setFocusRequest({ id: ++focusSequence.current, view: { center: [activeMap.effective_center_latitude, activeMap.effective_center_longitude], zoom: activeMap.effective_default_zoom } })
  }, [activeMapId, activeMap])

  useEffect(() => {
    if (!isMapWorkspace || bounds === null || activeMapId === null) return
    const controller = new AbortController(); const sequence = ++requestSequence.current
    const timeout = window.setTimeout(async () => {
      setIsLoading(true); setErrorMessage(null)
      try { const visible = await getMapPlaces({ bounds, mapId: activeMapId, limit: 1000 }, controller.signal); if (sequence === requestSequence.current) { setPlaces(visible); setSelectedPlace((current) => current === null ? null : visible.find((item) => item.id === current.id) ?? current) } }
      catch (error) { if (!isAbortError(error) && sequence === requestSequence.current) setErrorMessage(error instanceof Error ? error.message : 'Chargement impossible.') }
      finally { if (sequence === requestSequence.current) setIsLoading(false) }
    }, REQUEST_DEBOUNCE_MS)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [activeMapId, bounds, isMapWorkspace, refreshVersion])

  useEffect(() => {
    if (directPlaceId === null || places.some((place) => place.id === directPlaceId)) return
    const controller = new AbortController()
    void getPlaceDetails(directPlaceId, controller.signal).then((place) => {
      if (controller.signal.aborted) return
      if (place.latitude === null || place.longitude === null) return
      const marker: MapPlace = { id: place.id, map_id: place.map_id, name: place.name, latitude: place.latitude, longitude: place.longitude, categories: place.categories, tags: place.tags }
      setPlaces((current) => current.some((item) => item.id === marker.id) ? current : [...current, marker]); setSelectedPlace(marker)
      setFocusRequest({ id: ++focusSequence.current, view: { center: [marker.latitude, marker.longitude], zoom: Math.max(mapView.zoom, 13) } })
    }).catch((error: unknown) => { if (!isAbortError(error)) setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le POI demandé.') })
    return () => controller.abort()
  }, [directPlaceId, mapView.zoom, places])

  const handleMutation = (mutation: PlaceMutation) => { setSelectedPlace(null); setRemovedPlaceId(null); setRefreshVersion((value) => value + 1); if (mutation.mapId !== activeMapId) navigate(withMap('/', mutation.mapId)) }
  const handleDeletePlace = (id: string) => { setPlaces((current) => current.filter((place) => place.id !== id)); setSelectedPlace((current) => current?.id === id ? null : current); setRemovedPlaceId(id); setRefreshVersion((value) => value + 1) }
  const handleSelect = (place: PreviewPlace) => { setSelectedPlace(place); navigate(withMap(`/places/${place.id}`, activeMapId)); if (place.latitude !== null && place.longitude !== null) setFocusRequest({ id: ++focusSequence.current, view: { center: [place.latitude, place.longitude], zoom: Math.max(mapView.zoom, 13) } }) }
  const deleteActiveMap = async () => { if (!activeMap || !window.confirm(`Supprimer « ${activeMap.name} » ?`)) return; try { await deleteMap(activeMap.id); setMaps((current) => current.filter((item) => item.id !== activeMap.id)); navigate('/') } catch (error) { setMapsError(error instanceof ApiError && error.status === 409 ? 'Cette carte contient des POI et ne peut pas être supprimée.' : error instanceof Error ? error.message : 'Suppression impossible.') } }
  const sidebarState = deriveMapSidebarState(
    location.pathname,
    directPlaceId === null ? null : selectedPlace,
  )
  const selectedPlaceId = getSidebarPlaceId(sidebarState)
  const editorOpen = sidebarState.mode === 'create' || sidebarState.mode === 'edit'
  const closePopup = () => {
    if (sidebarState.mode === 'details' || sidebarState.mode === 'preview') {
      setSelectedPlace(null)
      navigate(withMap('/', activeMapId))
    }
  }
  const popupContent = selectedPlaceId !== null && !editorOpen ? <PlaceMapPopup placeId={selectedPlaceId} onEdit={() => navigate(withMap(`/places/${selectedPlaceId}/edit`, activeMapId))} onDeleted={(id) => { handleDeletePlace(id); navigate(withMap('/', activeMapId)) }} onClose={closePopup} /> : null

  return <main className="app-shell">
    <TopBar isMapWorkspace={isMapWorkspace} maps={maps} activeMapId={activeMapId} areMapsLoading={mapsLoading} mapsError={mapsError} markerCount={places.length} placeListOpen={placeListOpen} onMapChange={(id) => navigate(withMap(location.pathname, id))} onMapCreated={(poiMap) => { setMaps((current) => [...current, poiMap]); navigate(withMap('/', poiMap.id)) }} onDeleteMap={() => void deleteActiveMap()} onTogglePlaceList={() => setPlaceListOpen((open) => !open)} />
    <Routes>
      <Route path="*" element={<MapPage places={places} selectedPlaceId={selectedPlaceId} initialView={mapView} isLoading={isLoading} errorMessage={errorMessage} sidebarOpen={editorOpen} placeListOpen={placeListOpen} focusRequest={focusRequest} popupContent={popupContent} placeList={<MapPlaceList poiMap={activeMap} selectedPlaceId={selectedPlaceId} refreshVersion={refreshVersion} removedPlaceId={removedPlaceId} onPlaceSelect={handleSelect} />} sidebar={<MapSidebar state={sidebarState} activeMapId={activeMapId} maps={maps} onClose={() => { setSelectedPlace(null); navigate(withMap('/', activeMapId)) }} onPlaceMutated={handleMutation} onPlaceDeleted={handleDeletePlace} />} onBoundsChange={setBounds} onViewChange={setMapView} onPlaceSelect={handleSelect} onPopupClose={closePopup} />} />
      <Route path="/admin" element={<AdminLayout />}><Route index element={<Navigate to="categories" replace />} /><Route path="categories" element={<CategoriesPage />} /><Route path="tags" element={<TagsPage />} /></Route>
    </Routes>
  </main>
}

export default App
