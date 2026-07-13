import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PlaceDetailsPage } from './PlaceDetailsPage'
const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const COUNTRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PLACE = { id: '11111111-1111-4111-8111-111111111111', name: 'Manufacture', map_id: MAP_ID, map: { id: MAP_ID, name: 'Carte France', country: { id: COUNTRY_ID, iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' } }, description: null, region: 'Grand Est', construction_date: null, abandonment_date: null, condition: null, access: null, danger_level: null, longitude: 6.45, latitude: 48.17, categories: [], tags: [], created_at: '2026-07-13T10:00:00', updated_at: '2026-07-13T10:00:00' }
afterEach(() => vi.unstubAllGlobals())
describe('PlaceDetailsPage', () => { it('derives country from the map relationship', async () => { vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(String(input).endsWith('/photos') ? [] : PLACE), { status: 200, headers: { 'Content-Type': 'application/json' } })))); render(<MemoryRouter><PlaceDetailsPage placeId={PLACE.id} activeMapId={MAP_ID} /></MemoryRouter>); expect(await screen.findByRole('heading', { name: 'Manufacture' })).toBeVisible(); expect(screen.getByText('Carte France')).toBeVisible(); expect(screen.getByText('France')).toBeVisible(); expect(screen.queryByText('country')).not.toBeInTheDocument() }) })
