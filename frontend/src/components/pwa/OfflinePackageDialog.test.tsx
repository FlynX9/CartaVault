import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCartaVaultVectorConfig } from '../../api/vectorBasemap'
import { getOfflinePackage } from '../../pwa/offlineData'
import type { OfflinePackage } from '../../pwa/offlineData'
import type { PoiMap } from '../../types/map'
import { OfflinePackageDialog } from './OfflinePackageDialog'

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('../../i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string, params?: Record<string, string | number>) => {
  const template = ({
  'offline.basemapOption': 'Carte vectorielle CartaVault',
  'offline.basemapIncluded': 'Le fond vectoriel sera inclus.',
  'offline.basemapUnavailable': 'Le fond vectoriel est indisponible.',
  'offline.manageTitle': 'Gérer les données hors ligne',
  'offline.alreadyAvailable': 'Déjà disponible hors ligne',
  'offline.lastUpdated': 'Mis à jour le {{date}} · {{size}}',
  'offline.poiCount': 'POI · {{count}}',
  'offline.update': 'Mettre à jour',
  'offline.delete': 'Supprimer',
  }[key] ?? key)
  return Object.entries(params ?? {}).reduce((value, [name, replacement]) => value.replaceAll(`{{${name}}}`, String(replacement)), template)
} }) }))
vi.mock('../../api/vectorBasemap', () => ({ getCartaVaultVectorConfig: vi.fn() }))
vi.mock('../../pwa/offlineDownloadManager', () => ({ startOfflineDownload: vi.fn() }))
vi.mock('../../pwa/offlineData', () => ({
  defaultMapOfflineOptions: { basemap: true, places: true, organization: true, trip: false, annotations: true, routeGeometry: false, thumbnails: true },
  defaultTripOfflineOptions: { basemap: true, places: true, organization: true, trip: true, annotations: true, routeGeometry: true, thumbnails: true },
  downloadMapOfflinePackage: vi.fn(),
  downloadTripOfflinePackage: vi.fn(),
  deleteOfflinePackage: vi.fn(),
  getOfflinePackage: vi.fn().mockResolvedValue(null),
  getOfflineStorageEstimate: vi.fn().mockResolvedValue({ usage: 0, quota: 1024 }),
  requestPersistentOfflineStorage: vi.fn(),
}))

const map = { id: 'map-1', name: 'Belgique', country: { name: 'Belgique', iso_alpha2: 'BE' } } as PoiMap
const readyConfig = {
  enabled: true,
  available: true,
  country_code: 'BE',
  country_name: 'Belgique',
  state: 'ready' as const,
  phase: 'Disponible',
  error_code: null,
  error_message: null,
  archive_url: '/be.pmtiles',
  glyphs_url: '/fonts/{fontstack}/{range}.pbf',
  version: 'test',
  min_zoom: 0,
  max_zoom: 14,
  offline_min_zoom: 5,
  offline_max_zoom: 14,
  offline_padding_km: 20,
  offline_max_tiles: 25_000,
  attribution: 'OpenStreetMap',
}

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(getOfflinePackage).mockResolvedValue(null) })

describe('OfflinePackageDialog', () => {
  it('offers and selects the CartaVault map when the country archive is ready', async () => {
    vi.mocked(getCartaVaultVectorConfig).mockResolvedValue(readyConfig)
    render(<OfflinePackageDialog map={map} onClose={vi.fn()} />)

    const option = await screen.findByRole('checkbox', { name: 'Carte vectorielle CartaVault' })
    await waitFor(() => expect(option).toBeEnabled())
    expect(option).toBeChecked()
    expect(screen.getByText('Le fond vectoriel sera inclus.')).toBeVisible()
  })

  it('disables the map option when no vector archive is available', async () => {
    vi.mocked(getCartaVaultVectorConfig).mockResolvedValue({ ...readyConfig, available: false, state: 'not_installed', archive_url: null })
    render(<OfflinePackageDialog map={map} onClose={vi.fn()} />)

    const option = await screen.findByRole('checkbox', { name: 'Carte vectorielle CartaVault' })
    await waitFor(() => expect(option).toBeDisabled())
    expect(option).not.toBeChecked()
    expect(screen.getByText('Le fond vectoriel est indisponible.')).toBeVisible()
  })

  it('shows the contents and management actions when the map is already offline', async () => {
    vi.mocked(getCartaVaultVectorConfig).mockResolvedValue(readyConfig)
    vi.mocked(getOfflinePackage).mockResolvedValue({
      id: 'user-1:map:map-1', kind: 'map', sourceId: map.id, mapId: map.id, userId: 'user-1', title: map.name,
      schemaVersion: 1, revision: 'r1', included: { basemap: true, places: true, organization: false, trip: false, annotations: false, routeGeometry: false, thumbnails: false },
      createdAt: '2026-08-15T12:00:00Z', updatedAt: '2026-08-15T12:00:00Z', lastSyncedAt: '2026-08-15T12:00:00Z', estimatedBytes: 1024, actualBytes: 1024,
      snapshot: { map, places: [{}, {}, {}, {}], categories: [], tags: [], statuses: [], trip: null, photos: {}, thumbnails: {}, annotations: {} },
      status: 'ready', basemap: { version: 'test', bbox: [2, 49, 6, 52], minZoom: 5, maxZoom: 14, tileKeys: ['a', 'b'], tileBytes: 512 },
    } as unknown as OfflinePackage)

    render(<OfflinePackageDialog map={map} onClose={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Gérer les données hors ligne' })).toBeVisible()
    expect(screen.getByText('Déjà disponible hors ligne')).toBeVisible()
    expect(screen.getByText('POI · 4')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeVisible()
  })
})
