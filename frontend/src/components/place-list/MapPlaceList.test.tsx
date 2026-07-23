import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { getPlaceFacets, getPlaceListPosition, getPlaces } from '../../api/places'
import { DEFAULT_PLACE_FILTERS } from '../../places/placeFilters'
import { MapPlaceList } from './MapPlaceList'

vi.mock('../../api/places', () => ({ getPlaces: vi.fn(() => Promise.resolve([])), getPlaceListPosition: vi.fn(() => Promise.resolve({ place_id: 'place-id', matches_filters: true, index: 0, page: 0, page_size: 100 })), getPlaceFacets: vi.fn(() => Promise.resolve({ total: 42, non_visited: 31, visited: 11, favorites: 6, categories: [], tags: [], statuses: [], regions: [], access_values: [], danger_levels: [], condition_values: [], with_photos: 0, without_photos: 0, with_coordinates: 0, without_coordinates: 0, in_trip: 0, not_in_trip: 0 })), bulkUpdatePlaces: vi.fn(), bulkAddPlacesToTrip: vi.fn() }))
vi.mock('../../api/categories', () => ({ getCategories: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../api/tags', () => ({ getTags: vi.fn(() => Promise.resolve([])) }))
vi.mock('../../api/trips', () => ({ getTrip: vi.fn(), listTrips: vi.fn(() => Promise.resolve([])) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MapPlaceList', () => {
  it('shows only stable functional quick filters with dynamic counters', async () => {
    const onFiltersChange = vi.fn()
    render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} filters={{ ...DEFAULT_PLACE_FILTERS, functionalState: 'non_visited' }} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onFiltersChange={onFiltersChange} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /Tous42/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Non visités31/ })).toHaveClass('active')
    expect(screen.getByRole('button', { name: /Visités11/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Favoris6/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /À faire/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /À vérifier/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Favoris6/ }))
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ functionalState: 'non_visited', isFavorite: true }))
  })

  it('collapses to a summary row and restores the full places panel', async () => {
    const onCollapsedChange = vi.fn()
    const props = { poiMap: { id: 'map-id', name: 'France' } as never, selectedPlaceId: null, refreshVersion: 0, removedPlaceId: null, onPlaceSelect: vi.fn(), onCollapsedChange }
    const { container, rerender } = render(<MemoryRouter><MapPlaceList {...props} /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Réduire le panneau Lieux' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)

    rerender(<MemoryRouter><MapPlaceList {...props} collapsed /></MemoryRouter>)
    expect(container.querySelector('.places-redesign-panel')).toHaveClass('is-collapsed')
    expect(screen.getByText('Lieux')).toBeVisible()
    expect(screen.getByText('0 lieu')).toBeVisible()
    expect(container.querySelector('.places-redesign-panel')).toHaveClass('is-collapsed')
    fireEvent.click(screen.getByRole('button', { name: 'Déployer le panneau Lieux' }))
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false)
  })

  it('filters by the selected map UUID', async () => {
    const { container } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France', country: { iso_alpha2: 'FR', name: 'France' } } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(getPlaces).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-id' }), expect.any(AbortSignal)))
    expect(screen.getByText('Lieux')).toBeVisible()
    expect(screen.getByText(/France/)).toBeVisible()
    expect(container.querySelector('.places-redesign-map-flag')).toHaveAttribute('src', 'https://flagcdn.com/fr.svg')
  })

  it('does not restart POI loading when the active map reference changes', async () => {
    vi.mocked(getPlaces).mockClear()
    vi.mocked(getPlaces).mockResolvedValue([])
    const poiMap = { id: 'map-id', name: 'France' }
    const { rerender } = render(<MemoryRouter><MapPlaceList poiMap={poiMap as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    await waitFor(() => expect(getPlaces).toHaveBeenCalledTimes(1))
    rerender(<MemoryRouter><MapPlaceList poiMap={{ ...poiMap } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    await waitFor(() => expect(screen.queryByText('Chargementâ€¦')).not.toBeInTheDocument())
    expect(getPlaces).toHaveBeenCalledTimes(1)
  })

  it('renders POIs while facets are still loading', async () => {
    const place = { id: 'place-id', name: 'Disponible', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' }, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    vi.mocked(getPlaceFacets).mockImplementationOnce(() => new Promise(() => undefined))

    const { unmount } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /^Disponible/ })).toBeVisible()
    expect(screen.queryByText('Chargementâ€¦')).not.toBeInTheDocument()
    unmount()
  })

  it('renders map information and filters alongside each POI', async () => {
    const place = { id: 'place-id', name: 'Manufacture', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [{ id: 'category-id', name: 'Église', icon: 'mdi:church', is_primary: true }], tags: [{ id: 'tag-id', name: 'Patrimoine', color: '#336699' }] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    const select = vi.fn()
    const { container } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId="place-id" refreshVersion={0} removedPlaceId={null} onPlaceSelect={select} /></MemoryRouter>)
    const item = await screen.findByRole('button', { name: /^Manufacture/ })
    expect(item.closest('.places-place-card')).toHaveClass('selected')
    expect(screen.getByText('1 lieu')).toBeVisible()
    expect(container.querySelector('input[type="search"]')).toBeVisible()
    expect(container.querySelector('.places-advanced-filter')).toBeVisible()
    expect(container.querySelector('.places-place-category')).toHaveTextContent('Église–À faire')
    expect(container.querySelector('.places-place-status')).toHaveStyle({ color: '#2563EB' })
    expect(container.querySelector('.place-list-tag')).toHaveTextContent('Patrimoine')
    expect(container.querySelector('.place-list-tag')).toHaveStyle({ backgroundColor: '#336699', color: '#FFFFFF' })
    expect(container.querySelector('.place-list-category-bubble')).toHaveStyle({ backgroundColor: '#2563EB', borderColor: '#2563EB' })
    expect(container.querySelector('.place-list-category-bubble [data-category-icon-id="mdi:church"]')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Importer un fichier KMZ"]')).toBeVisible()
    fireEvent.click(item)
    expect(select).toHaveBeenCalledWith(place)
    expect(getPlaceListPosition).not.toHaveBeenCalled()
  })

  it('makes available POIs draggable only during trip planning', async () => {
    const place = { id: 'place-id', name: 'Étape', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    const { container, rerender } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} tripPlanningActive tripPlaceIds={new Set()} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /^Étape/ })).toHaveAttribute('draggable', 'true')
    expect(container.querySelector('[aria-label="Importer un fichier KMZ"]')).not.toBeInTheDocument()
    rerender(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} tripPlanningActive tripPlaceIds={new Set(['place-id'])} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /^Étape/ })).toHaveAttribute('draggable', 'false')
    expect(screen.getByText('Ajouté')).toBeVisible()
  })

  it('keeps the rich card layout when multi-selection is enabled', async () => {
    const place = { id: 'place-id', name: 'Sélection', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockResolvedValue([place])
    const { container } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France', can_edit: true } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    await waitFor(() => expect(container.querySelector('.places-place-card')).not.toBeNull())
    fireEvent.click(container.querySelector('.places-selection-toggle') as HTMLButtonElement)

    expect(container.querySelector('.places-place-card')).toHaveClass('has-selection')
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Sélection' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Actions groupées' })).toBeVisible()
  })
  it('starts a fresh request after the places panel is closed and reopened', async () => {
    const place = { id: 'place-after-reopen', name: 'Visible after reopen', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'Open', slug: 'open', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockReset()
    vi.mocked(getPlaces)
      .mockImplementationOnce((_query, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
      .mockResolvedValueOnce([place])

    const firstPanel = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(getPlaces).toHaveBeenCalledTimes(1))
    firstPanel.unmount()

    const secondPanel = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /^Visible after reopen/ })).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(getPlaces).toHaveBeenCalledTimes(2)
    secondPanel.unmount()
  })

  it('ignores a late response from a superseded list request', async () => {
    const oldPlace = { id: 'old-place', name: 'Old result', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'Open', slug: 'open', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    const currentPlace = { id: 'current-place', name: 'Current result', latitude: 48, longitude: 2, status: { id: 'status-id', name: 'Open', slug: 'open', color: '#2563EB', is_active: true }, categories: [], tags: [] } as never
    let resolveOldRequest: (places: never[]) => void = () => undefined
    vi.mocked(getPlaces).mockReset()
    vi.mocked(getPlaces)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldRequest = resolve }))
      .mockResolvedValueOnce([currentPlace])

    const { rerender } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} filters={DEFAULT_PLACE_FILTERS} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(getPlaces).toHaveBeenCalledTimes(1))
    rerender(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} filters={{ ...DEFAULT_PLACE_FILTERS, query: 'current' }} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /^Current result/ })).toBeVisible()
    await act(async () => resolveOldRequest([oldPlace]))
    expect(screen.queryByRole('button', { name: /^Old result/ })).not.toBeInTheDocument()
  })

  it('loads the next page automatically when the end sentinel becomes visible', async () => {
    let intersectionCallback: IntersectionObserverCallback | null = null
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) { intersectionCallback = callback }
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    const status = { id: 'status-id', name: 'Open', slug: 'open', color: '#2563EB', is_active: true }
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `place-${index}`, name: `Place ${index}`, latitude: 48, longitude: 2, status, categories: [], tags: [] })) as never[]
    const nextPlace = { id: 'place-101', name: 'Place 101', latitude: 48, longitude: 2, status, categories: [], tags: [] } as never
    vi.mocked(getPlaces).mockReset().mockResolvedValueOnce(firstPage).mockResolvedValueOnce([nextPlace])

    const { container } = render(<MemoryRouter><MapPlaceList poiMap={{ id: 'map-id', name: 'France' } as never} selectedPlaceId={null} refreshVersion={0} removedPlaceId={null} onPlaceSelect={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(container.querySelector('.place-list-load-sentinel')).not.toBeNull())

    await act(async () => intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))

    expect(await screen.findByRole('button', { name: /^Place 101/ })).toBeVisible()
    expect(getPlaces).toHaveBeenLastCalledWith(expect.objectContaining({ mapId: 'map-id', offset: 100, limit: 100 }), expect.any(AbortSignal))
    expect(container.querySelector('.place-list-load-sentinel')).toBeNull()
  })
})
