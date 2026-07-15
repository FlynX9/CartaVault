import { FileUp, Plus, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import { getPlaces } from '../../api/places'
import type { PoiMap } from '../../types/map'
import type { PlaceDetails, PreviewPlace } from '../../types/place'
import type { PlaceStatusSummary } from '../../types/status'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { withMap } from '../../utils/map'
import { MapMarkerFilterContext } from '../map/mapMarkerFilterContext'
import { KmzImportDialog } from '../imports/KmzImportDialog'

const PAGE_SIZE = 100

interface Props {
  poiMap: PoiMap | null
  statuses?: PlaceStatusSummary[]
  statusId?: string | null
  selectedPlaceId: string | null
  refreshVersion: number
  removedPlaceId: string | null
  onStatusChange?: (statusId: string | null) => void
  onPlaceSelect: (place: PreviewPlace) => void
  onClose?: () => void
  onImported?: () => void
}

const sortPlaces = (places: PlaceDetails[]) => [...places].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id))

function formatLastUpdate(value: string | undefined) {
  if (!value) return 'Mis à jour récemment'
  const elapsedMinutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 1) return 'Mis à jour à l’instant'
  if (elapsedMinutes < 60) return `Mis à jour il y a ${elapsedMinutes} min`
  if (elapsedMinutes < 1_440) return `Mis à jour il y a ${Math.floor(elapsedMinutes / 60)} h`
  return `Mis à jour le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(value))}`
}

export function MapPlaceList({ poiMap, statuses = [], statusId = null, selectedPlaceId, refreshVersion, removedPlaceId, onStatusChange = () => undefined, onPlaceSelect, onClose = () => undefined, onImported = () => undefined }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tagId, setTagId] = useState('')
  const [places, setPlaces] = useState<PlaceDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const { setFilter: setMarkerFilter } = useContext(MapMarkerFilterContext)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(search.trim()), 300)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    setCategoryId('')
    setTagId('')
  }, [poiMap?.id])

  useEffect(() => {
    setMarkerFilter({ query: debounced, categoryId, statusId, tagId })
  }, [categoryId, debounced, setMarkerFilter, statusId, tagId])

  useEffect(() => {
    if (!poiMap) {
      setPlaces([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getPlaces({ mapId: poiMap.id, statusId: statusId ?? undefined, q: debounced || undefined, limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then((page) => { setPlaces(page); setHasMore(page.length === PAGE_SIZE) })
      .catch((caught: unknown) => { if (!(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Chargement impossible.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [poiMap, statusId, debounced, refreshVersion])

  const categories = useMemo(() => [...new Map(places.flatMap((place) => place.categories).map((category) => [category.id, category])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [places])
  const tags = useMemo(() => [...new Map(places.flatMap((place) => place.tags).map((tag) => [tag.id, tag])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [places])
  const visible = useMemo(() => sortPlaces(places.filter((place) => place.id !== removedPlaceId && (categoryId === '' || place.categories.some((category) => category.id === categoryId)) && (tagId === '' || place.tags.some((tag) => tag.id === tagId)))), [places, removedPlaceId, categoryId, tagId])

  useEffect(() => {
    if (selectedPlaceId) refs.current.get(selectedPlaceId)?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedPlaceId, visible])

  const loadMore = async () => {
    if (!poiMap) return
    const page = await getPlaces({ mapId: poiMap.id, statusId: statusId ?? undefined, q: debounced || undefined, limit: PAGE_SIZE, offset: places.length })
    setPlaces((current) => [...current, ...page])
    setHasMore(page.length === PAGE_SIZE)
  }

  const resetFilters = () => {
    setSearch('')
    setCategoryId('')
    setTagId('')
    onStatusChange(null)
  }

  return <aside className="country-place-panel cv-workspace-panel" id="map-place-list" tabIndex={-1} aria-labelledby="map-place-list-title">
    <header className="cv-workspace-panel__header">
      <div className="cv-workspace-panel__heading"><p className="cv-workspace-panel__eyebrow place-list-kicker">Lieux</p><h2 id="map-place-list-title" className="cv-workspace-panel__title">{poiMap?.country?.name ?? poiMap?.name ?? 'Points d’intérêt'}</h2>
      {poiMap && <p className="place-list-map-meta"><span>{formatLastUpdate(poiMap.updated_at)}</span></p>}</div>
      <div className="cv-workspace-panel__header-actions">{poiMap && <span className="cv-workspace-panel__count">{visible.length} POI{visible.length > 1 ? 's' : ''}</span>}{poiMap && <button className="panel-icon-button" type="button" aria-label="Importer un fichier KMZ" title="Importer un KMZ" onClick={() => setImporting(true)}><FileUp size={18} /></button>}{poiMap && <Link className="panel-icon-button primary" to={withMap('/places/new', poiMap.id, statusId)} aria-label="Ajouter un POI" title="Ajouter un POI"><Plus size={18} /></Link>}<button className="panel-icon-button" type="button" aria-label="Fermer le panneau" title="Fermer" onClick={onClose}><X size={18} /></button></div>
    </header>
    {poiMap && <section className="place-list-controls" aria-label="Recherche et filtres des lieux">
      <label className="place-list-search"><Search aria-hidden="true" size={18} /><span className="visually-hidden">Rechercher un POI</span><input type="search" value={search} placeholder="Rechercher un POI…" onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="place-list-filters">
        <select aria-label="Filtrer par catégorie" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Tout</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select aria-label="Filtrer par statut" value={statusId ?? ''} onChange={(event) => onStatusChange(event.target.value || null)}><option value="">Tout</option>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}</select>
        <select aria-label="Filtrer par tag" value={tagId} onChange={(event) => setTagId(event.target.value)}><option value="">Tout</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
        <button className="place-list-reset" type="button" onClick={resetFilters} disabled={search === '' && categoryId === '' && tagId === '' && statusId === null}>Réinitialiser</button>
      </div>
    </section>}
    <div className="place-list-body cv-workspace-panel__content">
      {!poiMap && <p className="place-list-message">Sélectionnez une carte pour afficher ses POI.</p>}
      {loading && <p role="status">Chargement…</p>}
      {error && <p role="alert">{error}</p>}
      {visible.length > 0 && <ul className="country-place-list cv-workspace-panel__list">{visible.map((place) => {
        const primaryCategory = place.categories.find((item) => item.is_primary) ?? place.categories[0]
        return <li key={place.id}><button ref={(node) => { if (node) refs.current.set(place.id, node); else refs.current.delete(place.id) }} type="button" className={`place-list-item cv-workspace-panel__card${place.id === selectedPlaceId ? ' selected' : ''}`} onClick={() => onPlaceSelect(place)}>
          <i className="place-list-status-dot" role="img" aria-label={`Statut : ${place.status.name}`} style={{ backgroundColor: place.status.color }} />
          <span className="place-list-category-bubble" title={primaryCategory?.name} aria-hidden="true">{primaryCategory && <CategoryIconPreview iconId={primaryCategory.icon} size={18} showLabel={false} />}</span>
          <span className="place-list-item-content"><strong>{place.name}</strong>{primaryCategory && <span className="place-list-category-name">{primaryCategory.name}</span>}{place.tags.length > 0 && <span className="place-list-tags">{place.tags.map((tag) => <span className="place-list-tag" key={tag.id}>{tag.name}</span>)}</span>}</span>
        </button></li>
      })}</ul>}
      {!loading && poiMap && visible.length === 0 && <p className="place-list-message">Aucun POI ne correspond aux filtres.</p>}
      {hasMore && <button className="place-list-more" type="button" onClick={() => void loadMore()}>Charger plus</button>}
    </div>
  {importing && poiMap && <KmzImportDialog poiMap={poiMap} onClose={() => setImporting(false)} onImported={onImported} />}</aside>
}
