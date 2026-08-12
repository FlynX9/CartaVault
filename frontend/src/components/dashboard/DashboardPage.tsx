import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Earth,
  FolderOpen,
  Heart,
  Images,
  Map,
  MapPin,
  MapPinned,
  Plus,
  Route,
  Shapes,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getDashboard } from '../../api/dashboard'
import { getPhotoFileUrl } from '../../api/photos'
import { useAuth } from '../../auth/useAuth'
import { useI18n } from '../../i18n/useI18n'
import type { Dashboard } from '../../types/dashboard'
import type { PoiMap } from '../../types/map'
import { formatRouteDistance, formatRouteDuration } from '../trips/tripMetrics'
import { CategoryIconPreview } from '../icons/CategoryIconPreview'
import { CountryFlag } from '../maps/CountryFlag'
import { DashboardMapPreview } from './DashboardMapPreview'
import { OnboardingCard } from './OnboardingCard'

interface DashboardPageProps {
  maps: PoiMap[]
  activeMapId: string | null
  onCreateMap: () => void
  onCreatePlace: (mapId: string) => void
  onImportKmz: (mapId: string) => void
  onCreateTrip: (mapId: string) => void
  onOpenPlace: (placeId: string, mapId: string) => void
  onOpenTrip: (tripId: string, mapId: string) => void
}

const EMPTY_DASHBOARD: Dashboard = {
  summary: {
    places: 0, maps: 0, countries: 0, trips: 0, visited_places: 0,
    unvisited_places: 0, favorites: 0, media: 0, places_without_photos: 0,
    planned_trips: 0, completed_trips: 0,
  },
  statuses: [], top_countries: [], top_categories: [], recent_places: [],
  recent_trips: [],
  attention: {
    without_photos: 0, without_categories: 0, without_coordinates: 0,
    without_region: 0, possible_duplicates: 0, stale_routes: 0,
    incomplete_map_metadata: 0,
  },
  map_points: [], activity: [],
}

export function DashboardPage({
  maps,
  activeMapId,
  onCreateMap,
  onCreatePlace,
  onImportKmz,
  onCreateTrip,
  onOpenPlace,
  onOpenTrip,
}: DashboardPageProps) {
  const { user } = useAuth()
  const { t, formatDate, formatNumber } = useI18n()
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targetMapId, setTargetMapId] = useState(activeMapId ?? maps[0]?.id ?? '')
  const [mapChooserOpen, setMapChooserOpen] = useState(false)
  const mapChooserRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (targetMapId && maps.some((map) => map.id === targetMapId)) return
    setTargetMapId(activeMapId && maps.some((map) => map.id === activeMapId) ? activeMapId : maps[0]?.id ?? '')
  }, [activeMapId, maps, targetMapId])

  useEffect(() => {
    if (!mapChooserOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!mapChooserRef.current?.contains(event.target as Node)) setMapChooserOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapChooserOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mapChooserOpen])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void getDashboard(controller.signal)
      .then((value) => {
        setDashboard(value)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof Error && caught.name === 'AbortError')) {
          setError(caught instanceof Error ? caught.message : t('dashboard.error'))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [t])

  const totalStatusPlaces = dashboard.statuses.reduce((total, item) => total + item.count, 0)
  const statusGradient = useMemo(() => {
    if (totalStatusPlaces === 0) return 'var(--cv-color-mist)'
    let offset = 0
    return `conic-gradient(${dashboard.statuses.map((item) => {
      const start = offset
      offset += (item.count / totalStatusPlaces) * 100
      return `${item.color} ${start}% ${offset}%`
    }).join(', ')})`
  }, [dashboard.statuses, totalStatusPlaces])
  const maxCountry = Math.max(...dashboard.top_countries.map((item) => item.count), 1)
  const maxCategory = Math.max(...dashboard.top_categories.map((item) => item.count), 1)
  const targetMap = maps.find((map) => map.id === targetMapId) ?? null
  const hasMaps = maps.length > 0
  const canEditTargetMap = targetMap?.can_edit === true
  const canImportIntoTargetMap = targetMap !== null && targetMap.can_import !== false && targetMap.can_edit === true
  const unavailableReason = !hasMaps ? t('dashboard.action.noMaps') : t('dashboard.action.noPermission')
  const attentionItems = [
    ['without_photos', Camera],
    ['without_categories', Shapes],
    ['without_coordinates', MapPin],
    ['without_region', Earth],
    ['possible_duplicates', Copy],
    ['stale_routes', Route],
    ['incomplete_map_metadata', FolderOpen],
  ] as const

  if (loading) {
    return <main className="dashboard-page dashboard-page--state" id="main-content" aria-busy="true">
      <div className="dashboard-loading" role="status" aria-label={t('dashboard.loading')}>
        <span className="dashboard-loading__title" />
        <span className="dashboard-loading__subtitle" />
        <div className="dashboard-loading__kpis">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div>
        <div className="dashboard-loading__panels"><i /><i /><i /></div>
        <p>{t('dashboard.loading')}</p>
      </div>
    </main>
  }

  if (error) {
    return <main className="dashboard-page dashboard-page--state" id="main-content">
      <div className="dashboard-error" role="alert"><AlertTriangle /><h1>{t('dashboard.errorTitle')}</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>{t('dashboard.retry')}</button></div>
    </main>
  }

  return <main className="dashboard-page" id="main-content">
    <header className="dashboard-hero">
      <div>
        <p className="dashboard-eyebrow">{t('dashboard.eyebrow')}</p>
        <h1>{t('dashboard.welcome', { name: user?.display_name.split(/\s+/)[0] || 'CartaVault' })}</h1>
        <p>{t('dashboard.summary', { places: dashboard.summary.places, maps: dashboard.summary.maps, countries: dashboard.summary.countries })}</p>
      </div>
      <div className="dashboard-quick-actions" aria-label={t('dashboard.quickActions')}>
        <div className="dashboard-map-target" ref={mapChooserRef}>
          <span><Map aria-hidden="true" />{t('dashboard.targetMap')}</span>
          <button
            type="button"
            className="dashboard-map-target__trigger"
            role="combobox"
            aria-label={t('dashboard.targetMap')}
            aria-expanded={mapChooserOpen}
            aria-controls="dashboard-map-options"
            disabled={!hasMaps}
            onClick={() => setMapChooserOpen((open) => !open)}
          >
            {targetMap
              ? <><CountryFlag countryCode={targetMap.country.iso_alpha2} className="dashboard-map-target__flag" fallbackSize={17} /><strong>{targetMap.name}</strong></>
              : <strong>{t('dashboard.noMaps')}</strong>}
            <ChevronDown aria-hidden="true" />
          </button>
          {mapChooserOpen && <div className="dashboard-map-target__options" id="dashboard-map-options" role="listbox" aria-label={t('dashboard.targetMap')}>
            {maps.map((map) => <button
              key={map.id}
              type="button"
              role="option"
              aria-selected={map.id === targetMapId}
              onClick={() => {
                setTargetMapId(map.id)
                setMapChooserOpen(false)
              }}
            >
              <CountryFlag countryCode={map.country.iso_alpha2} className="dashboard-map-target__flag" fallbackSize={17} />
              <span>{map.name}</span>
              {map.id === targetMapId && <Check aria-hidden="true" />}
            </button>)}
          </div>}
        </div>
        <button type="button" className="cv-home-action-button primary" onClick={onCreateMap}><Plus /><span>{t('dashboard.action.map')}</span></button>
        <button type="button" className="cv-home-action-button" disabled={!canEditTargetMap} title={!canEditTargetMap ? unavailableReason : undefined} onClick={() => targetMap && onCreatePlace(targetMap.id)}><MapPin /><span>{t('dashboard.action.place')}</span></button>
        <button className="cv-home-action-button dashboard-kmz-import-action" type="button" disabled={!canImportIntoTargetMap} title={!canImportIntoTargetMap ? unavailableReason : undefined} onClick={() => targetMap && onImportKmz(targetMap.id)}><Upload /><span>{t('dashboard.action.import')}</span></button>
        <button type="button" className="cv-home-action-button" disabled={!canEditTargetMap} title={!canEditTargetMap ? unavailableReason : undefined} onClick={() => targetMap && onCreateTrip(targetMap.id)}><Route /><span>{t('dashboard.action.trip')}</span></button>
      </div>
    </header>

    <OnboardingCard maps={maps} dashboard={dashboard} onCreateMap={onCreateMap} onCreatePlace={onCreatePlace} onImportKmz={onImportKmz} onCreateTrip={onCreateTrip} />

    <section className="dashboard-primary-kpis" aria-label={t('dashboard.overview')}>
      {([
        ['places', MapPin, dashboard.summary.places],
        ['maps', Map, dashboard.summary.maps],
        ['countries', Earth, dashboard.summary.countries],
        ['trips', Route, dashboard.summary.trips],
      ] as const).map(([key, Icon, value]) => <article key={key}>
        <span><Icon aria-hidden="true" /></span>
        <div><strong>{formatNumber(value)}</strong><p>{t(`dashboard.kpi.${key}`)}</p></div>
      </article>)}
    </section>

    <section className="dashboard-secondary-kpis" aria-label={t('dashboard.details')}>
      {([
        ['visited', CheckCircle2, dashboard.summary.visited_places],
        ['unvisited', CircleHelp, dashboard.summary.unvisited_places],
        ['favorites', Heart, dashboard.summary.favorites],
        ['media', Images, dashboard.summary.media],
        ['withoutPhotos', Camera, dashboard.summary.places_without_photos],
        ['plannedTrips', Clock3, dashboard.summary.planned_trips],
        ['completedTrips', CheckCircle2, dashboard.summary.completed_trips],
      ] as const).map(([key, Icon, value]) => <article key={key}><Icon aria-hidden="true" /><strong>{formatNumber(value)}</strong><span>{t(`dashboard.secondary.${key}`)}</span></article>)}
    </section>

    <div className="dashboard-grid dashboard-grid--analytics">
      <section className="dashboard-card dashboard-status-card">
        <header><div><p>{t('dashboard.analytics')}</p><h2>{t('dashboard.statuses')}</h2></div><span>{formatNumber(totalStatusPlaces)}</span></header>
        {dashboard.statuses.length === 0 ? <DashboardEmpty /> : <div className="dashboard-status-content">
          <div className="dashboard-donut" style={{ background: statusGradient }} aria-label={t('dashboard.statusChart', { count: totalStatusPlaces })}><span><strong>{formatNumber(totalStatusPlaces)}</strong><small>{t('dashboard.places')}</small></span></div>
          <ul>{dashboard.statuses.map((status) => <li key={`${status.name}\u0000${status.color}`}><i style={{ background: status.color }} /><span>{status.name}</span><strong>{formatNumber(status.count)}</strong></li>)}</ul>
        </div>}
      </section>

      <section className="dashboard-card">
        <header><div><p>{t('dashboard.analytics')}</p><h2>{t('dashboard.countries')}</h2></div></header>
        {dashboard.top_countries.length === 0 ? <DashboardEmpty /> : <ul className="dashboard-ranking">{dashboard.top_countries.map((country) => <li key={country.country_code ?? country.name}>
          <CountryFlag countryCode={country.country_code ?? ''} />
          <span><b>{country.name}</b><i><em style={{ width: `${country.count / maxCountry * 100}%` }} /></i></span>
          <strong>{formatNumber(country.count)}</strong>
        </li>)}</ul>}
      </section>

      <section className="dashboard-card">
        <header><div><p>{t('dashboard.analytics')}</p><h2>{t('dashboard.categories')}</h2></div></header>
        {dashboard.top_categories.length === 0 ? <DashboardEmpty /> : <ul className="dashboard-ranking">{dashboard.top_categories.map((category) => <li key={`${category.name}\u0000${category.icon ?? ''}`}>
          <span className="dashboard-category-icon"><CategoryIconPreview iconId={category.icon ?? undefined} size={18} showLabel={false} /></span>
          <span><b>{category.name}</b><i><em style={{ width: `${category.count / maxCategory * 100}%` }} /></i></span>
          <strong>{formatNumber(category.count)}</strong>
        </li>)}</ul>}
      </section>
    </div>

    <div className="dashboard-grid dashboard-grid--recent">
      <section className="dashboard-card dashboard-recent">
        <header><div><p>{t('dashboard.recent')}</p><h2>{t('dashboard.recentPlaces')}</h2></div></header>
        {dashboard.recent_places.length === 0 ? <DashboardEmpty /> : <ul>{dashboard.recent_places.map((place) => <li key={place.id}>
          <button type="button" onClick={() => onOpenPlace(place.id, place.map_id)}>
            <span className="dashboard-recent-icon">{place.primary_photo_id ? <img src={getPhotoFileUrl(place.primary_photo_id)} alt="" /> : <MapPin />}</span>
            <span><strong>{place.name}</strong><small><CountryFlag countryCode={place.country_code} />{place.region || place.country_name} · {place.map_name}</small></span>
            {place.is_favorite ? <Heart className="dashboard-recent-favorite" fill="currentColor" aria-label={t('dashboard.favorite')} /> : <i style={{ background: place.status_color }} title={place.status_name} />}
            <time dateTime={place.updated_at}>{formatDate(place.updated_at, { dateStyle: 'medium' })}</time>
            <ArrowRight />
          </button>
        </li>)}</ul>}
      </section>
      <section className="dashboard-card dashboard-recent">
        <header><div><p>{t('dashboard.recent')}</p><h2>{t('dashboard.recentTrips')}</h2></div></header>
        {dashboard.recent_trips.length === 0 ? <DashboardEmpty /> : <ul>{dashboard.recent_trips.map((trip) => <li key={trip.id}>
          <button type="button" onClick={() => onOpenTrip(trip.id, trip.map_id)}>
            <span className="dashboard-recent-icon"><Route /></span>
            <span><strong>{trip.name}</strong><small><em className="dashboard-trip-status">{t(`dashboard.tripStatus.${trip.status}` as Parameters<typeof t>[0])}</em>{trip.map_name} · {trip.day_count} {t('dashboard.days', { count: trip.day_count })} · {formatRouteDistance(trip.route_distance_meters)} · {formatRouteDuration(trip.route_duration_seconds)}</small></span>
            <time dateTime={trip.updated_at}>{formatDate(trip.updated_at, { dateStyle: 'medium' })}</time>
            <ArrowRight />
          </button>
        </li>)}</ul>}
      </section>
    </div>

    <div className="dashboard-grid dashboard-grid--bottom">
      <section className="dashboard-card dashboard-attention">
        <header><div><p>{t('dashboard.quality')}</p><h2>{t('dashboard.attention')}</h2></div></header>
        <ul>{attentionItems.map(([key, Icon]) => <li key={key}><span><Icon /></span><div><strong>{formatNumber(dashboard.attention[key])}</strong><p>{t(`dashboard.attention.${key}`)}</p></div></li>)}</ul>
      </section>
      <section className="dashboard-card dashboard-map-card">
        <header><div><p>{t('dashboard.geography')}</p><h2>{t('dashboard.mapPreview')}</h2></div><span>{t('dashboard.mapPreviewHint')}</span></header>
        {dashboard.map_points.length === 0 ? <DashboardEmpty /> : <DashboardMapPreview points={dashboard.map_points} label={t('dashboard.mapPreview')} />}
      </section>
    </div>

    {dashboard.activity.length > 0 && <section className="dashboard-card dashboard-activity">
      <header><div><p>{t('dashboard.recent')}</p><h2>{t('dashboard.activity')}</h2></div></header>
      <ol>{dashboard.activity.map((item) => <li key={item.id}><span /><div><strong>{item.place_name}</strong><p>{activityLabel(item.action, t)}</p></div><time dateTime={item.created_at}>{formatDate(item.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</time></li>)}</ol>
    </section>}
  </main>
}

function DashboardEmpty() {
  const { t } = useI18n()
  return <div className="dashboard-empty"><MapPinned aria-hidden="true" /><p>{t('dashboard.empty')}</p></div>
}

function activityLabel(action: string, t: ReturnType<typeof useI18n>['t']) {
  const supportedActions = new Set([
    'created', 'updated', 'trashed', 'restored',
    'photo_added', 'photo_removed',
    'category_added', 'category_removed',
    'tag_added', 'tag_removed',
    'primary_category_changed',
    'link_added', 'link_updated', 'link_removed',
  ])
  const translationAction = supportedActions.has(action) ? action : 'updated'
  return t(`dashboard.activity.${translationAction}` as Parameters<typeof t>[0])
}
