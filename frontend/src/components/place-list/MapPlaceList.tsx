import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlaces } from '../../api/places'
import type { PoiMap } from '../../types/map'
import type { PlaceDetails, PreviewPlace } from '../../types/place'

const PAGE_SIZE = 100
interface Props { poiMap: PoiMap | null; selectedPlaceId: string | null; refreshVersion: number; removedPlaceId: string | null; onPlaceSelect: (place: PreviewPlace) => void }
const sortPlaces = (places: PlaceDetails[]) => [...places].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id))

export function MapPlaceList({ poiMap, selectedPlaceId, refreshVersion, removedPlaceId, onPlaceSelect }: Props) {
  const [search, setSearch] = useState(''); const [debounced, setDebounced] = useState(''); const [places, setPlaces] = useState<PlaceDetails[]>([]); const [loading, setLoading] = useState(false); const [hasMore, setHasMore] = useState(false); const [error, setError] = useState<string | null>(null); const refs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => { const timeout = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(timeout) }, [search])
  useEffect(() => {
    if (!poiMap) { setPlaces([]); return }
    const controller = new AbortController(); setLoading(true); setError(null)
    void getPlaces({ mapId: poiMap.id, q: debounced || undefined, limit: PAGE_SIZE, offset: 0 }, controller.signal).then((page) => { setPlaces(page); setHasMore(page.length === PAGE_SIZE) }).catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [poiMap, debounced, refreshVersion])
  const visible = useMemo(() => sortPlaces(places.filter((item) => item.id !== removedPlaceId)), [places, removedPlaceId])
  useEffect(() => { if (selectedPlaceId) refs.current.get(selectedPlaceId)?.scrollIntoView?.({ block: 'nearest' }) }, [selectedPlaceId, visible])
  const loadMore = async () => { if (!poiMap) return; const page = await getPlaces({ mapId: poiMap.id, q: debounced || undefined, limit: PAGE_SIZE, offset: places.length }); setPlaces((current) => [...current, ...page]); setHasMore(page.length === PAGE_SIZE) }
  return <aside className="country-place-panel" id="map-place-list" aria-labelledby="map-place-list-title"><header className="place-list-header"><div><p className="place-list-kicker">Exploration</p><h2 id="map-place-list-title">{poiMap?.name ?? 'Points d’intérêt'}</h2></div><span className="place-list-count">{visible.length} chargé{visible.length > 1 ? 's' : ''}</span></header>
    {poiMap && <label className="place-list-search"><span>Rechercher un POI</span><input type="search" value={search} placeholder={`Rechercher sur ${poiMap.name}`} onChange={(event) => setSearch(event.target.value)} /></label>}
    <div className="place-list-body">{!poiMap && <p className="place-list-message">Sélectionnez une carte pour afficher ses POI.</p>}{loading && <p role="status">Chargement…</p>}{error && <p role="alert">{error}</p>}{visible.length > 0 && <ul className="country-place-list">{visible.map((place) => <li key={place.id}><button ref={(node) => { if (node) refs.current.set(place.id, node); else refs.current.delete(place.id) }} type="button" className={`place-list-item${place.id === selectedPlaceId ? ' selected' : ''}`} onClick={() => onPlaceSelect(place)}><strong>{place.name}</strong>{place.categories.length > 0 && <span>{place.categories.slice(0, 2).map((item) => item.name).join(' · ')}</span>}</button></li>)}</ul>}{hasMore && <button className="place-list-more" type="button" onClick={() => void loadMore()}>Charger plus</button>}</div>
  </aside>
}
