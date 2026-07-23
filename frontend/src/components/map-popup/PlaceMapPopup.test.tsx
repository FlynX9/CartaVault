import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePlace, getPlaceDetails } from '../../api/places'
import { getPlacePhotos } from '../../api/photos'
import { geocodingService } from '../../geocoding/geocodingService'
import { PlaceMapPopup } from './PlaceMapPopup'

vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn(), deletePlace: vi.fn() }))
vi.mock('../../api/photos', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/photos')>()), getPlacePhotos: vi.fn() }))
vi.mock('../../geocoding/geocodingService', () => ({ geocodingService: { reverse: vi.fn() } }))
const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLACE = { id: PLACE_ID, name: 'Manufacture', map_id: MAP_ID, map: { id: MAP_ID, name: 'Carte France', country: { id: 'country-id', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' } }, status: { id: 'status-id', map_id: MAP_ID, name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const }, description: 'Ancienne usine', region: null, construction_date: '1890', abandonment_date: '1999', condition: 'Dégradé', access: 'Interdit', danger_level: 'Élevé', longitude: 6.45, latitude: 48.17, categories: [{ id: 'category-id', name: 'Industrie', description: null, icon: 'mdi:church', is_primary: true }], tags: [{ id: 'tag-id', name: 'Brique' }], custom_fields: { gx_media_links: 'technical-data' }, interest_rating: null, visit_rating: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
const PHOTO = { id: '22222222-2222-4222-8222-222222222222', place_id: PLACE_ID, filename: 'photo.jpg', original_name: null, path: 'must-not-be-used.jpg', description: 'Façade', taken_at: null, sort_order: 0, is_primary: true, created_at: null }

beforeEach(() => { vi.mocked(getPlaceDetails).mockResolvedValue(PLACE); vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO]); vi.mocked(deletePlace).mockResolvedValue(); vi.mocked(geocodingService.reverse).mockResolvedValue([]) })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('PlaceMapPopup', () => {
  it('uses the compact card hierarchy and shows the first image from the file endpoint', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Manufacture' })).toBeVisible()
    expect(screen.getByText('Ancienne usine')).toBeVisible()
    expect(screen.getByLabelText('Copier les coordonnées GPS')).toBeVisible()
    expect(screen.getByText('Tags')).toBeVisible(); expect(screen.getByText('Non noté')).toBeVisible()
    expect(screen.queryByText('Données importées')).not.toBeInTheDocument(); expect(screen.queryByText('technical-data')).not.toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'Façade' })
    expect(image).toHaveAttribute('src', expect.stringContaining(`/photos/${PHOTO.id}/file`))
    expect(image).not.toHaveAttribute('src', expect.stringContaining('must-not-be-used'))
    expect(getPlaceDetails).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal)); expect(getPlacePhotos).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal))
  })

  it('renders the primary category icon in the overview area', async () => {
    const { container } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })
    expect(container.querySelector('.popup-title-marker')).not.toBeInTheDocument()
    const status = screen.getByRole('region', { name: 'Statut' })
    expect(within(status).getByText('Statut')).toBeVisible()
    expect(within(status).getByText('À faire')).toBeVisible()
    const category = screen.getByRole('region', { name: 'Catégorie' })
    expect(within(category).getByText('Catégorie')).toBeVisible()
    expect(within(category).getByText('Industrie')).toBeVisible()
    expect(category.querySelector('.popup-primary-category [data-category-icon-id="mdi:church"]')).toBeInTheDocument()
  })

  it('shows only the rating that matches the status visit classification', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ ...PLACE, interest_rating: 4, visit_rating: 2 })
    const { rerender } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    const interestRating = await screen.findByLabelText('Envie avant visite : 4 sur 5')
    expect(interestRating).toBeVisible()
    expect(interestRating).toHaveStyle({ color: PLACE.status.color })
    expect(interestRating.querySelector('svg')).toHaveAttribute('width', '19')
    expect(screen.queryByLabelText(/Évaluation après visite/)).not.toBeInTheDocument()
    expect(screen.getByText('4.0')).toBeVisible()

    vi.mocked(getPlaceDetails).mockResolvedValue({
      ...PLACE,
      status: { ...PLACE.status, name: 'Visité', slug: 'visite', functional_state: 'visited' },
      interest_rating: 4,
      visit_rating: 2,
    })
    rerender(<PlaceMapPopup placeId="visited-place" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByLabelText('Évaluation après visite : 2 sur 5')).toBeVisible()
    expect(screen.queryByLabelText(/Envie avant visite/)).not.toBeInTheDocument()
    expect(screen.getByText('2.0')).toBeVisible()
  })

  it('opens the popup photo in the full-screen viewer and preserves the POI card after closing it', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })

    fireEvent.click(screen.getByRole('button', { name: /Façade/ }))
    const viewer = screen.getByRole('dialog', { name: 'Manufacture' })
    expect(viewer).toBeVisible()
    expect(within(viewer).getByRole('img', { name: 'Façade' })).toHaveAttribute('src', expect.stringContaining(`/photos/${PHOTO.id}/file`))

    fireEvent.click(within(viewer).getByRole('button', { name: /Fermer la visionneuse|Close photo viewer/ }))
    expect(screen.queryByRole('dialog', { name: 'Manufacture' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Manufacture' })).toBeVisible()
  })

  it('uses reverse geocoding to display the city and postal code from GPS coordinates', async () => {
    vi.mocked(geocodingService.reverse).mockResolvedValue([{ id: 'reverse:1', name: 'Rougemont-le-Château', formattedAddress: 'Rougemont-le-Château, 90110', latitude: 48.17, longitude: 6.45, locality: 'Rougemont-le-Château', postalCode: '90110', source: 'stadia' }])
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('Rougemont-le-Château, 90110')).toBeVisible()
    expect(geocodingService.reverse).toHaveBeenCalledWith(48.17, 6.45, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('keeps textual details visible with no photo, a missing file, or photo API failure', async () => {
    vi.mocked(getPlacePhotos).mockResolvedValue([])
    const { rerender } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('Aucune photo')).toBeVisible(); expect(screen.getByText('Ancienne usine')).toBeVisible()
    vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO])
    rerender(<PlaceMapPopup placeId="another-id" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    fireEvent.error(await screen.findByRole('img', { name: 'Façade' })); expect(await screen.findByText('Image indisponible')).toBeVisible()
    vi.mocked(getPlacePhotos).mockRejectedValue(new Error('offline'))
    rerender(<PlaceMapPopup placeId="third-id" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('Photos indisponibles')).toBeVisible(); expect(screen.getByRole('heading', { name: 'Manufacture' })).toBeVisible()
  })

  it('reports detail failures without hiding the close action', async () => {
    vi.mocked(getPlaceDetails).mockRejectedValue(new Error('404'))
    const close = vi.fn()
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={close} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('404'); fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); expect(close).toHaveBeenCalled()
  })

  it('provides accessible edit, Google Maps, close and confirmed delete actions', async () => {
    const edit = vi.fn(); const close = vi.fn(); const deleted = vi.fn()
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={edit} onDeleted={deleted} onClose={close} />)
    await screen.findByRole('heading', { name: 'Manufacture' })
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le POI' })); expect(edit).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Ouvrir dans Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=48.17%2C6.45')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fiche' })); expect(close).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le POI' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer ce lieu ?' })
    expect(within(dialog).getByText('« Manufacture » sera placé dans la corbeille.')).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' })); await waitFor(() => expect(deleted).toHaveBeenCalledWith(PLACE_ID)); expect(deletePlace).toHaveBeenCalledWith(PLACE_ID)
  })
})
