import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTrip, listAccessibleTrips } from '../../api/trips'
import { TripsWorkspacePanel } from './TripsWorkspacePanel'

vi.mock('../../api/trips', () => ({ createTrip: vi.fn(), listAccessibleTrips: vi.fn() }))
vi.mock('../../api/photos', () => ({ getPhotoThumbnailUrl: (id: string) => `/photos/${id}/thumbnail` }))

const trips = [
  { id: 'trip-1', map_id: 'map-1', map_name: 'France Urbex', country_name: 'France', country_code: 'FR', name: 'Week-end urbex', start_date: '2026-06-12', end_date: '2026-06-14', status: 'planned', created_at: '2026-05-01T10:00:00Z', updated_at: '2026-06-10T10:00:00Z', day_count: 3, stop_count: 7, thumbnail_photo_id: 'photo-1' },
  { id: 'trip-2', map_id: 'map-1', map_name: 'France Urbex', country_name: 'France', country_code: 'FR', name: 'Sans image', start_date: null, end_date: null, status: 'draft', created_at: '2026-05-01T10:00:00Z', updated_at: '2026-06-11T10:00:00Z', day_count: 0, stop_count: 0, thumbnail_photo_id: null },
] as const

describe('TripsWorkspacePanel', () => {
  beforeEach(() => {
    vi.mocked(listAccessibleTrips).mockResolvedValue([...trips])
    vi.mocked(createTrip).mockResolvedValue({} as never)
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders real trip summary data as visual cards and preserves opening', async () => {
    const open = vi.fn()
    const { container } = render(<TripsWorkspacePanel maps={[{ id: 'map-1', name: 'France Urbex', can_edit: true } as never]} onOpen={open} />)

    expect(await screen.findByText('Week-end urbex')).toBeVisible()
    expect(screen.getByText('2 sorties')).toBeVisible()
    expect(screen.getAllByText('France · France Urbex')[0]).toBeVisible()
    expect(screen.getByText('7 lieux')).toBeVisible()
    expect(screen.getByText(/3 jours · 12 juin 2026/)).toBeVisible()
    expect(screen.getByText(/Mise à jour le 10 juin 2026/)).toBeVisible()
    expect(container.querySelector('.maps-catalog__preview img')).toHaveAttribute('src', '/photos/photo-1/thumbnail')
    expect(container.querySelectorAll('.maps-catalog__preview img')).toHaveLength(1)
    expect(container.querySelector('.maps-catalog__card:nth-child(2) .maps-catalog__preview svg')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Ouvrir' })[0])
    expect(open).toHaveBeenCalledWith(trips[0])
  })

  it('filters trips and keeps the empty state when no trip is accessible', async () => {
    const { rerender } = render(<TripsWorkspacePanel maps={[]} onOpen={vi.fn()} />)
    await screen.findByText('Week-end urbex')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher une sortie' }), { target: { value: 'image' } })
    expect(screen.getByText('Sans image')).toBeVisible()
    expect(screen.queryByText('Week-end urbex')).not.toBeInTheDocument()

    vi.mocked(listAccessibleTrips).mockResolvedValue([])
    rerender(<TripsWorkspacePanel key="empty" maps={[]} onOpen={vi.fn()} />)
    expect(await screen.findByText('Aucune sortie accessible.')).toBeVisible()
  })

  it('marks the open trip and closes it from its card', async () => {
    const close = vi.fn()
    const { container } = render(<TripsWorkspacePanel maps={[]} activeTripId="trip-1" onOpen={vi.fn()} onCloseActive={close} />)

    await screen.findByText('Week-end urbex')
    expect(container.querySelector('.maps-catalog__card')).toHaveClass('active')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(close).toHaveBeenCalledOnce()
  })
})
