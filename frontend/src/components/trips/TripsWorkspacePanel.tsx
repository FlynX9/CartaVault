import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, ExternalLink, Image, MapPin, Plus, Search } from 'lucide-react'

import { createTrip, listAccessibleTrips, listTrips } from '../../api/trips'
import { getPhotoThumbnailUrl } from '../../api/photos'
import { useI18n } from '../../i18n/useI18n'
import type { PoiMap } from '../../types/map'
import type { Trip, TripListItem } from '../../types/trip'
import { CreateTripDialog } from './CreateTripDialog'

interface Props {
  maps: PoiMap[]
  mapId?: string
  fixedMapId?: string
  activeTripId?: string | null
  onOpen: (trip: TripListItem) => void
  onCloseActive?: () => void
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
}

function toTripListItem(trip: Trip, map: PoiMap | undefined): TripListItem {
  return {
    id: trip.id,
    map_id: trip.map_id,
    map_name: map?.name ?? '',
    country_name: map?.country.name ?? '',
    country_code: map?.country.iso_alpha2 ?? '',
    name: trip.name,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
    created_at: trip.created_at,
    updated_at: trip.updated_at,
    day_count: trip.days.length,
    stop_count: trip.days.reduce((count, day) => count + day.stops.length, 0),
    thumbnail_photo_id: null,
  }
}

export function TripsWorkspacePanel({ maps, mapId, fixedMapId = mapId, activeTripId = null, onOpen, onCloseActive = () => undefined }: Props) {
  const { t, formatDate } = useI18n()
  const [trips, setTrips] = useState<TripListItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setTrips([])
    setQuery('')
    setError(null)
    const loadTrips = mapId
      ? listTrips(mapId, controller.signal).then((items) => items.filter((trip) => trip.map_id === mapId).map((trip) => toTripListItem(trip, maps.find((map) => map.id === mapId))))
      : listAccessibleTrips(controller.signal)
    void loadTrips
      .then((items) => { if (active) { setTrips(items); setError(null) } })
      .catch((caught: unknown) => { if (active && !(caught instanceof Error && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : t('common.error.generic')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [mapId, maps, t])

  const filteredTrips = useMemo(() => {
    const normalized = normalize(query.trim())
    if (!normalized) return trips
    return trips.filter((trip) => normalize(`${trip.name} ${trip.map_name} ${trip.country_name}`).includes(normalized))
  }, [query, trips])

  const editableMaps = maps.filter((map) => map.can_edit && (!fixedMapId || map.id === fixedMapId))
  const openCreate = () => {
    if (editableMaps.length > 0) setCreateOpen(true)
  }

  return <aside className="country-place-panel workspace-management-panel cv-workspace-panel maps-workspace-panel trips-workspace-panel" aria-labelledby="workspace-trips-title" tabIndex={-1}>
    <header className="cv-workspace-panel__header">
      <div className="cv-workspace-panel__heading">
        <p className="cv-workspace-panel__eyebrow">{t('trips.library.eyebrow')}</p>
        <h2 id="workspace-trips-title" className="cv-workspace-panel__title">{mapId ? t('trips.library.mapTitle') : t('nav.trips')}</h2>
      </div>
      <div className="cv-workspace-panel__header-actions">
        <span className="cv-workspace-panel__count">{t('trips.library.count', { count: trips.length })}</span>
        <button type="button" className="panel-icon-button primary panel-create-action" onClick={openCreate} disabled={editableMaps.length === 0}><Plus size={18} aria-hidden="true" /><span className="panel-create-action__label">{t('trips.create')}</span></button>
      </div>
    </header>
    <div className="maps-workspace-panel__content trips-workspace-panel__content">
      <label className="workspace-search-field">
        <Search aria-hidden="true" size={17} />
        <span className="visually-hidden">{t('trips.library.search')}</span>
        <input type="search" placeholder={t('trips.library.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p role="status">{t('common.loading')}</p>}
      {!loading && trips.length === 0 && <p className="trips-workspace-panel__empty">{t('trips.empty')}</p>}
      {!loading && trips.length > 0 && filteredTrips.length === 0 && <p className="trips-workspace-panel__empty">{t('trips.library.noResult')}</p>}
      <ul className="maps-catalog" aria-label={t('trips.library.available')}>
        {filteredTrips.map((trip) => { const tripDate = trip.start_date ?? trip.end_date; return <li key={trip.id} className={`maps-catalog__card${trip.id === activeTripId ? ' active' : ''}`}>
          <div className="maps-catalog__summary">
          <div className="maps-catalog__preview">
            {trip.thumbnail_photo_id ? <img src={getPhotoThumbnailUrl(trip.thumbnail_photo_id)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.removeAttribute('hidden') }} /> : null}
            <span hidden={Boolean(trip.thumbnail_photo_id)}><Image size={28} aria-hidden="true" /></span>
          </div>
          <div className="maps-catalog__details">
            <div className="maps-catalog__title"><span className="maps-catalog__title-copy"><strong>{trip.name}</strong><small>{trip.country_name} · {trip.map_name}</small></span></div>
            <div className="maps-catalog__metrics">
              <span><MapPin size={16} aria-hidden="true" />{t('trips.library.placeCount', { count: trip.stop_count })}</span>
              <span><CalendarDays size={16} aria-hidden="true" />{t('trips.day', { count: trip.day_count })}{tripDate ? ` · ${formatDate(tripDate, { dateStyle: 'medium' })}` : ''}</span>
              {trip.updated_at && <span><Clock3 size={16} aria-hidden="true" />{t('trips.library.updatedOn', { date: formatDate(trip.updated_at, { dateStyle: 'medium' }) })}</span>}
            </div>
              <div className="maps-catalog__actions"><button type="button" className={`secondary-button maps-catalog__open${trip.id === activeTripId ? ' maps-catalog__close' : ''}`} onClick={() => trip.id === activeTripId ? onCloseActive() : onOpen(trip)}>{trip.id === activeTripId ? t('common.close') : t('maps.open')}<ExternalLink size={15} /></button></div>
          </div>
          </div>
        </li>})}
      </ul>
    </div>
    {createOpen && <CreateTripDialog fixedMapId={fixedMapId} maps={editableMaps} onClose={() => setCreateOpen(false)} onCreate={async (selectedMapId, payload) => { const selectedMap = editableMaps.find((map) => map.id === selectedMapId); if (!selectedMap || (fixedMapId && selectedMapId !== fixedMapId)) return; const created = await createTrip(selectedMapId, payload); setCreateOpen(false); onOpen({ id: created.id, map_id: created.map_id, map_name: selectedMap.name, country_name: selectedMap.country.name, country_code: selectedMap.country.iso_alpha2, name: created.name, start_date: created.start_date, end_date: created.end_date, status: created.status, created_at: created.created_at, updated_at: created.updated_at, day_count: created.days.length, stop_count: created.days.reduce((count, day) => count + day.stops.length, 0), thumbnail_photo_id: null }) }} />}
  </aside>
}
