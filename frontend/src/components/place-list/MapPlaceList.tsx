import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlaces } from '../../api/places'
import type { PoiMap } from '../../types/map'
import type { PlaceDetails, PreviewPlace } from '../../types/place'
import type { PlaceStatusSummary } from '../../types/status'
import { CategoryIcon } from '../categories/categoryIcons'

const PAGE_SIZE = 100
interface Props { poiMap: PoiMap | null; statuses?: PlaceStatusSummary[]; statusId?: string | null; selectedPlaceId: string | null; refreshVersion: number; removedPlaceId: string | null; onStatusChange?: (statusId: string | null) => void; onPlaceSelect: (place: PreviewPlace) => void }
const sortPlaces = (places: PlaceDetails[]) => [...places].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id))

export function MapPlaceList({ poiMap, statuses = [], statusId = null, selectedPlaceId, refreshVersion, removedPlaceId, onStatusChange = () => undefined, onPlaceSelect }: Props) {
  const [search, setSearch] = useState(''); const [debounced, setDebounced] = useState(''); const [places, setPlaces] = useState<PlaceDetails[]>([]); const [loading, setLoading] = useState(false); const [hasMore, setHasMore] = useState(false); const [error, setError] = useState<string | null>(null); const refs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => { const timeout = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(timeout) }, [search])
  useEffect(() => {
    if (!poiMap) { setPlaces([]); return }
    const controller = new AbortController(); setLoading(true); setError(null)
    void getPlaces({ mapId: poiMap.id, statusId: statusId ?? undefined, q: debounced || undefined, limit: PAGE_SIZE, offset: 0 }, controller.signal).then((page) => { setPlaces(page); setHasMore(page.length === PAGE_SIZE) }).catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [poiMap, statusId, debounced, refreshVersion])
  const visible = useMemo(() => sortPlaces(places.filter((item) => item.id !== removedPlaceId)), [places, removedPlaceId])
  useEffect(() => { if (selectedPlaceId) refs.current.get(selectedPlaceId)?.scrollIntoView?.({ block: 'nearest' }) }, [selectedPlaceId, visible])
  const loadMore = async () => { if (!poiMap) return; const page = await getPlaces({ mapId: poiMap.id, statusId: statusId ?? undefined, q: debounced || undefined, limit: PAGE_SIZE, offset: places.length }); setPlaces((current) => [...current, ...page]); setHasMore(page.length === PAGE_SIZE) }
  return <aside className="country-place-panel" id="map-place-list" aria-labelledby="map-place-list-title"><header className="place-list-header"><div><p className="place-list-kicker">Exploration</p><h2 id="map-place-list-title">{poiMap?.name ?? 'Points d’intérêt'}</h2></div><span className="place-list-count">{visible.length} chargé{visible.length > 1 ? 's' : ''}</span></header>
    {poiMap && <><label className="place-list-search"><span>Filtrer par statut</span><select value={statusId ?? ''} onChange={(event) => onStatusChange(event.target.value || null)}><option value="">Tous les statuts</option>{statuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="place-list-search"><span>Rechercher un POI</span><input type="search" value={search} placeholder={`Rechercher sur ${poiMap.name}`} onChange={(event) => setSearch(event.target.value)} /></label></>}
    <div className="place-list-body">{!poiMap && <p className="place-list-message">Sélectionnez une carte pour afficher ses POI.</p>}{loading && <p role="status">Chargement…</p>}{error && <p role="alert">{error}</p>}{visible.length > 0 && <ul className="country-place-list">{visible.map((place) => <li key={place.id}><button ref={(node) => { if (node) refs.current.set(place.id, node); else refs.current.delete(place.id) }} type="button" className={`place-list-item${place.id === selectedPlaceId ? ' selected' : ''}`} onClick={() => onPlaceSelect(place)}><strong>{place.name}</strong><span className="place-status-label"><i className="status-dot" style={{ backgroundColor: place.status.color }} />{place.status.name}</span>{place.categories.find((item) => item.is_primary) && <span className="place-status-label"><CategoryIcon icon={place.categories.find((item) => item.is_primary)?.icon} />{place.categories.find((item) => item.is_primary)?.name}</span>}</button></li>)}</ul>}{hasMore && <button className="place-list-more" type="button" onClick={() => void loadMore()}>Charger plus</button>}</div>
  </aside>
}
