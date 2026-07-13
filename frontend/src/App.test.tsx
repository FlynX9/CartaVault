import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { deleteMap, getMaps } from './api/maps'
import { ApiError } from './api/client'
import App from './App'

vi.mock('./api/maps', () => ({ getMaps: vi.fn(), deleteMap: vi.fn() }))
vi.mock('./api/places', () => ({ getMapPlaces: vi.fn(() => Promise.resolve([])), getPlaces: vi.fn(() => Promise.resolve([])) }))
vi.mock('./pages/MapPage', () => ({ MapPage: ({ placeList, sidebar, focusRequest }: { placeList: ReactNode; sidebar: ReactNode; focusRequest: { id: number } | null }) => <div data-testid="workspace" data-focus={focusRequest?.id ?? ''}>{placeList}{sidebar}</div> }))
const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MAP = { id: MAP_ID, name: 'Carte France', country_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', country: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' }, center_latitude: null, center_longitude: null, default_zoom: null, effective_center_latitude: 46.2, effective_center_longitude: 2.2, effective_default_zoom: 5, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null, created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }
function Path() { const location = useLocation(); return <output data-testid="path">{location.pathname}{location.search}</output> }
beforeEach(() => vi.mocked(getMaps).mockResolvedValue([MAP])); afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
describe('map URL workspace', () => {
  it('restores a map UUID, exposes only created maps and recenters from API values', async () => { render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>); expect(await screen.findByRole('combobox', { name: 'Carte' })).toHaveValue(MAP_ID); expect(screen.getByRole('option', { name: /Carte France/ })).toBeVisible(); await waitFor(() => expect(screen.getByTestId('workspace')).toHaveAttribute('data-focus', '1')) })
  it('writes the selected map UUID to the URL', async () => { render(<MemoryRouter initialEntries={['/']}><App /><Path /></MemoryRouter>); await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(`/?map=${MAP_ID}`)); fireEvent.click(screen.getByRole('button', { name: 'Créer une carte' })); expect(screen.getByRole('heading', { name: 'Créer une carte' })).toBeVisible() })
  it('reports refusal when deleting a map that contains POI', async () => { vi.mocked(deleteMap).mockRejectedValue(new ApiError(409, 'Conflict')); vi.stubGlobal('confirm', vi.fn(() => true)); render(<MemoryRouter initialEntries={[`/?map=${MAP_ID}`]}><App /><Path /></MemoryRouter>); fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la carte' })); expect(await screen.findByRole('alert')).toHaveTextContent('Cette carte contient des POI') })
})
