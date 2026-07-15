import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePlace, getPlaceDetails } from '../../api/places'
import { getPlacePhotos } from '../../api/photos'
import { PlaceMapPopup } from './PlaceMapPopup'

vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn(), deletePlace: vi.fn() }))
vi.mock('../../api/photos', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/photos')>()), getPlacePhotos: vi.fn() }))
const PLACE_ID = '11111111-1111-4111-8111-111111111111'; const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLACE = { id: PLACE_ID, name: 'Manufacture', map_id: MAP_ID, map: { id: MAP_ID, name: 'Carte France', country: { id: 'country-id', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' } }, status: { id: 'status-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true }, description: 'Ancienne usine', region: null, construction_date: '1890', abandonment_date: '1999', condition: 'Dégradé', access: 'Interdit', danger_level: 'Élevé', longitude: 6.45, latitude: 48.17, categories: [{ id: 'category-id', name: 'Industrie', description: null, icon: 'mdi:church', is_primary: true }], tags: [{ id: 'tag-id', name: 'Brique' }], created_at: '2026-01-01', updated_at: '2026-01-01' }
const PHOTO = { id: '22222222-2222-4222-8222-222222222222', place_id: PLACE_ID, filename: 'photo.jpg', original_name: null, path: 'must-not-be-used.jpg', description: 'Façade', taken_at: null, sort_order: 0, is_primary: true, created_at: null }

beforeEach(() => { vi.mocked(getPlaceDetails).mockResolvedValue(PLACE); vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO]); vi.mocked(deletePlace).mockResolvedValue() })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('PlaceMapPopup', () => {
  it('loads details and photos independently and shows the first image from the file endpoint', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Manufacture' })).toBeVisible(); expect(screen.getByText('Ancienne usine')).toBeVisible(); expect(screen.getByText('Carte France · France')).toBeVisible()
    const image = screen.getByRole('img', { name: 'Façade' }); expect(image).toHaveAttribute('src', expect.stringContaining(`/photos/${PHOTO.id}/file`)); expect(image).not.toHaveAttribute('src', expect.stringContaining('must-not-be-used'))
    expect(getPlaceDetails).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal)); expect(getPlacePhotos).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal))
  })
  it('renders the Iconify primary category icon instead of the fallback', async () => {
    const { container } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('Catégorie')).toBeVisible()
    expect(screen.getByText('Industrie')).toBeVisible()
    expect(container.querySelector('.popup-summary [data-category-icon-id="mdi:church"]')).toBeInTheDocument()
  })
  it('keeps textual details visible with no photo, a missing file, or photo API failure', async () => {
    vi.mocked(getPlacePhotos).mockResolvedValue([]); const { rerender } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />); expect(await screen.findByText('Aucune photo')).toBeVisible(); expect(screen.getByText('Ancienne usine')).toBeVisible()
    vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO]); rerender(<PlaceMapPopup placeId="another-id" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />); fireEvent.error(await screen.findByRole('img', { name: 'Façade' })); expect(screen.getByText('Image indisponible')).toBeVisible()
    vi.mocked(getPlacePhotos).mockRejectedValue(new Error('offline')); rerender(<PlaceMapPopup placeId="third-id" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />); expect(await screen.findByText('Photos indisponibles')).toBeVisible(); expect(screen.getByRole('heading', { name: 'Manufacture' })).toBeVisible()
  })
  it('reports detail failures without hiding the close action', async () => { vi.mocked(getPlaceDetails).mockRejectedValue(new Error('404')); const close = vi.fn(); render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={close} />); expect(await screen.findByRole('alert')).toHaveTextContent('404'); fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); expect(close).toHaveBeenCalled() })
  it('provides accessible edit, Google Maps, close and confirmed delete actions', async () => { const edit = vi.fn(); const close = vi.fn(); const deleted = vi.fn(); vi.stubGlobal('confirm', vi.fn(() => true)); render(<PlaceMapPopup placeId={PLACE_ID} onEdit={edit} onDeleted={deleted} onClose={close} />); await screen.findByRole('heading', { name: 'Manufacture' }); fireEvent.click(screen.getByRole('button', { name: 'Modifier le POI' })); expect(edit).toHaveBeenCalled(); expect(screen.getByRole('link', { name: 'Ouvrir dans Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=48.17%2C6.45'); fireEvent.click(screen.getByRole('button', { name: 'Fermer la fiche' })); expect(close).toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Supprimer le POI' })); await waitFor(() => expect(deleted).toHaveBeenCalledWith(PLACE_ID)); expect(deletePlace).toHaveBeenCalledWith(PLACE_ID); expect(window.confirm).toHaveBeenCalledWith('Supprimer « Manufacture » ?') })
})
