import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDashboard } from '../../api/dashboard'
import type { Dashboard } from '../../types/dashboard'
import type { PoiMap } from '../../types/map'
import { DashboardPage } from './DashboardPage'


vi.mock('../../api/dashboard', () => ({ getDashboard: vi.fn() }))
vi.mock('../../api/account', () => ({ getAccountPreferences: vi.fn().mockResolvedValue({ language: 'fr', preferred_basemap: 'cartavault-light', density: 'compact', startup_panel: 'maps', timezone: 'Europe/Paris', trash_retention_days: 30, routing: { provider: 'osrm', stay_in_country: false, avoid_tolls: false, avoid_highways: false, avoid_ferries: false, traffic_mode: 'traffic_unaware' }, onboarding: { dismissed: true, completed_steps: [] } }), updateAccountPreferences: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { display_name: 'Alice Martin' } }),
}))
const translate = (key: string, values?: Record<string, unknown>) => {
  if (key === 'dashboard.welcome') return `Hello ${values?.name}`
  if (key === 'dashboard.summary') return `${values?.places} places / ${values?.maps} maps / ${values?.countries} countries`
  return key
}
vi.mock('../../i18n/useI18n', () => ({
  useI18n: () => ({
    t: translate,
    formatDate: (value: string) => value.slice(0, 10),
    formatNumber: (value: number) => String(value),
  }),
}))
vi.mock('./DashboardMapPreview', () => ({
  DashboardMapPreview: ({ points, label }: { points: unknown[]; label: string }) => (
    <div aria-label={label}>map points: {points.length}</div>
  ),
}))
vi.mock('../icons/CategoryIconPreview', () => ({
  CategoryIconPreview: () => <span aria-hidden="true">icon</span>,
}))

const dashboard: Dashboard = {
  summary: {
    places: 12,
    maps: 2,
    countries: 2,
    trips: 3,
    visited_places: 4,
    unvisited_places: 8,
    favorites: 2,
    media: 6,
    places_without_photos: 6,
    planned_trips: 2,
    completed_trips: 1,
  },
  statuses: [{ id: 'status-1', name: 'To do', color: '#0FA68A', count: 12 }],
  top_countries: [{ id: null, name: 'France', country_code: 'FR', icon: null, count: 12 }],
  top_categories: [{ id: 'category-1', name: 'Castle', country_code: null, icon: 'mdi:castle', count: 8 }],
  recent_places: [{
    id: 'place-1',
    map_id: 'map-1',
    map_name: 'France',
    name: 'Old castle',
    country_name: 'France',
    country_code: 'FR',
    region: 'Normandy',
    status_name: 'To do',
    status_color: '#0FA68A',
    is_favorite: true,
    primary_photo_id: null,
    updated_at: '2026-07-26T08:00:00Z',
  }],
  recent_trips: [{
    id: 'trip-1',
    map_id: 'map-1',
    map_name: 'France',
    name: 'Normandy loop',
    status: 'planned',
    start_date: null,
    end_date: null,
    day_count: 2,
    route_distance_meters: 12000,
    route_duration_seconds: 3600,
    updated_at: '2026-07-25T08:00:00Z',
  }],
  attention: {
    without_photos: 6,
    without_categories: 1,
    without_coordinates: 2,
    without_region: 3,
    possible_duplicates: 1,
    stale_routes: 1,
    incomplete_map_metadata: 0,
  },
  map_points: [{ latitude: 48.8, longitude: 2.3, count: 12 }],
  activity: [{
    id: 'activity-1',
    place_id: 'place-1',
    place_name: 'Old castle',
    action: 'created',
    created_at: '2026-07-26T08:00:00Z',
  }],
}

const callbacks = {
  onCreateMap: vi.fn(),
  onCreatePlace: vi.fn(),
  onImportKmz: vi.fn(),
  onCreateTrip: vi.fn(),
  onOpenPlace: vi.fn(),
  onOpenTrip: vi.fn(),
}

const editableMap: PoiMap = {
  id: 'map-1',
  name: 'France',
  country_id: 'country-1',
  country: { id: 'country-1', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' },
  center_latitude: null,
  center_longitude: null,
  default_zoom: null,
  effective_center_latitude: 46.2,
  effective_center_longitude: 2.2,
  effective_default_zoom: 6,
  min_latitude: null,
  max_latitude: null,
  min_longitude: null,
  max_longitude: null,
  created_at: '2026-07-01T08:00:00Z',
  updated_at: '2026-07-26T08:00:00Z',
  can_edit: true,
  can_import: true,
  place_count: 0,
  trip_count: 0,
}

const dashboardProps = { maps: [editableMap], activeMapId: editableMap.id }

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(getDashboard).mockResolvedValue(dashboard)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders accessible aggregates, recent content and the lightweight map preview', async () => {
    render(<DashboardPage {...dashboardProps} {...callbacks} />)

    expect(screen.getByRole('status')).toHaveTextContent('dashboard.loading')
    expect(await screen.findByRole('heading', { name: 'Hello Alice' })).toBeVisible()
    expect(screen.getByText('12 places / 2 maps / 2 countries')).toBeVisible()
    fireEvent.click(screen.getByRole('combobox', { name: 'dashboard.targetMap' }))
    expect(screen.getByRole('option', { name: 'France' })).toBeVisible()
    expect(screen.getAllByText('Old castle')).toHaveLength(2)
    expect(screen.getByText('Normandy loop')).toBeVisible()
    expect(screen.getByLabelText('dashboard.mapPreview')).toHaveTextContent('map points: 1')
    expect(screen.getByText('dashboard.activity.created')).toBeVisible()
  })

  it('reuses the existing workflows and disables write actions for a viewer', async () => {
    const firstRender = render(<DashboardPage maps={[{ ...editableMap, can_edit: false, can_import: false }]} activeMapId={editableMap.id} {...callbacks} />)
    await screen.findByRole('heading', { name: 'Hello Alice' })

    expect(screen.getByRole('button', { name: /dashboard.action.place/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dashboard.action.import/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dashboard.action.trip/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /dashboard.action.map/ }))
    expect(callbacks.onCreateMap).toHaveBeenCalledOnce()

    firstRender.unmount()
    render(<DashboardPage {...dashboardProps} {...callbacks} />)
    await screen.findByRole('heading', { name: 'Hello Alice' })
    fireEvent.click(screen.getByRole('button', { name: /dashboard.action.place/ }))
    fireEvent.click(screen.getByRole('button', { name: /dashboard.action.import/ }))
    fireEvent.click(screen.getByRole('button', { name: /dashboard.action.trip/ }))
    expect(callbacks.onCreatePlace).toHaveBeenCalledWith('map-1')
    expect(callbacks.onImportKmz).toHaveBeenCalledWith('map-1')
    expect(callbacks.onCreateTrip).toHaveBeenCalledWith('map-1')
  })

  it('targets the selected map and disables contextual actions when no map exists', async () => {
    const secondMap = { ...editableMap, id: 'map-2', name: 'Germany', country: { ...editableMap.country, id: 'country-2', iso_alpha2: 'DE', iso_alpha3: 'DEU', name: 'Germany' } }
    const firstRender = render(<DashboardPage maps={[editableMap, secondMap]} activeMapId={editableMap.id} {...callbacks} />)
    await screen.findByRole('heading', { name: 'Hello Alice' })

    fireEvent.click(screen.getByRole('combobox', { name: 'dashboard.targetMap' }))
    fireEvent.click(screen.getByRole('option', { name: 'Germany' }))
    fireEvent.click(screen.getByRole('button', { name: /dashboard.action.place/ }))
    expect(callbacks.onCreatePlace).toHaveBeenCalledWith(secondMap.id)

    firstRender.unmount()
    render(<DashboardPage maps={[]} activeMapId={null} {...callbacks} />)
    await screen.findByRole('heading', { name: 'Hello Alice' })
    expect(screen.getByRole('combobox', { name: 'dashboard.targetMap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dashboard.action.place/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dashboard.action.import/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dashboard.action.trip/ })).toBeDisabled()
  })

  it('renders a stable empty state', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ...dashboard,
      summary: Object.fromEntries(Object.keys(dashboard.summary).map((key) => [key, 0])) as unknown as Dashboard['summary'],
      statuses: [],
      top_countries: [],
      top_categories: [],
      recent_places: [],
      recent_trips: [],
      map_points: [],
      activity: [],
    })
    render(<DashboardPage maps={[]} activeMapId={null} {...callbacks} />)

    await screen.findByRole('heading', { name: 'Hello Alice' })
    expect(screen.getAllByText('dashboard.empty').length).toBeGreaterThanOrEqual(5)
  })

  it('isolates an API failure behind a readable dashboard error state', async () => {
    vi.mocked(getDashboard).mockRejectedValue(new Error('Dashboard request failed'))
    render(<DashboardPage maps={[]} activeMapId={null} {...callbacks} />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    expect(screen.getByRole('alert')).toHaveTextContent('Dashboard request failed')
    expect(screen.getByRole('button', { name: 'dashboard.retry' })).toBeVisible()
  })
})
