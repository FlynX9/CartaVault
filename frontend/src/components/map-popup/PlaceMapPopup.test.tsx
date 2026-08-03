import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deletePlace, getPlaceDetails, getPlaceHistory } from '../../api/places'
import { getPlacePhotos, uploadPlacePhoto } from '../../api/photos'
import { PlaceMapPopup } from './PlaceMapPopup'

vi.mock('../../api/places', () => ({ getPlaceDetails: vi.fn(), getPlaceHistory: vi.fn(), deletePlace: vi.fn() }))
vi.mock('../../api/photos', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/photos')>()), getPlacePhotos: vi.fn(), uploadPlacePhoto: vi.fn() }))
const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLACE = { id: PLACE_ID, name: 'Manufacture', map_id: MAP_ID, map: { id: MAP_ID, name: 'Carte France', country: { id: 'country-id', iso_alpha2: 'FR', iso_alpha3: 'FRA', name: 'France' } }, status: { id: 'status-id', map_id: MAP_ID, name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const }, description: 'Ancienne usine', region: null, construction_date: '1890', abandonment_date: '1999', condition: 'Dégradé', access: 'Interdit', danger_level: 'Élevé', longitude: 6.45, latitude: 48.17, categories: [{ id: 'category-id', name: 'Industrie', description: null, icon: 'mdi:church', is_primary: true }], tags: [{ id: 'tag-id', name: 'Brique' }], custom_fields: { gx_media_links: 'technical-data' }, interest_rating: null, visit_rating: null, created_at: '2026-01-01', updated_at: '2026-02-02' }
const PHOTO = { id: '22222222-2222-4222-8222-222222222222', place_id: PLACE_ID, filename: 'photo.jpg', original_name: null, path: 'must-not-be-used.jpg', description: 'Façade', taken_at: null, sort_order: 0, is_primary: true, created_at: null }
const SECOND_PHOTO = { ...PHOTO, id: '33333333-3333-4333-8333-333333333333', filename: 'second.jpg', description: 'Cour intérieure', sort_order: 1, is_primary: false }

beforeEach(() => { vi.mocked(getPlaceDetails).mockResolvedValue(PLACE); vi.mocked(getPlaceHistory).mockResolvedValue({ items: [], total: 0, offset: 0, limit: 50 }); vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO]); vi.mocked(uploadPlacePhoto).mockResolvedValue(SECOND_PHOTO); vi.mocked(deletePlace).mockResolvedValue() })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('PlaceMapPopup', () => {
  it('adds a clipboard image to the currently opened editable POI', async () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })
    const clipboardImage = new File(['image'], 'capture.png', { type: 'image/png' })
    const pasteTarget = screen.getByRole('textbox', { name: 'Collage d’image depuis le presse-papiers' })
    await waitFor(() => expect(pasteTarget).toHaveFocus())

    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(pasteTarget).toHaveFocus()
    fireEvent.paste(pasteTarget, { clipboardData: { files: [clipboardImage], items: [] } })

    await waitFor(() => expect(uploadPlacePhoto).toHaveBeenCalledWith(PLACE_ID, expect.objectContaining({ type: 'image/png' })))
    expect(await screen.findByText('Image ajoutée depuis le presse-papiers.')).toBeVisible()
    expect(screen.getByLabelText('Navigation des photos')).toHaveTextContent('1 / 2')

    const dismissNotice = timeoutSpy.mock.calls.find(([, delay]) => delay === 3000)?.[0]
    expect(dismissNotice).toBeTypeOf('function')
    act(() => dismissNotice?.())
    expect(screen.queryByText('Image ajoutée depuis le presse-papiers.')).not.toBeInTheDocument()
  })

  it('falls back to the Clipboard API when Ctrl+V emits no paste event', async () => {
    const read = vi.fn().mockResolvedValue([{ types: ['image/png'], getType: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })) }])
    vi.stubGlobal('navigator', { language: 'fr-FR', clipboard: { read } })
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })

    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    await waitFor(() => expect(uploadPlacePhoto).toHaveBeenCalledWith(PLACE_ID, expect.objectContaining({ type: 'image/png' })))
    expect(await screen.findByText('Image ajoutée depuis le presse-papiers.')).toBeVisible()
  })

  it('does not intercept image pastes in text fields or on a read-only POI', async () => {
    const { rerender } = render(<><input aria-label="Champ texte" /><PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} /></>)
    await screen.findByRole('heading', { name: 'Manufacture' })
    const clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => new File(['image'], 'capture.png', { type: 'image/png' }) }] }
    const textField = screen.getByRole('textbox', { name: 'Champ texte' })
    textField.focus()
    fireEvent.keyDown(textField, { key: 'v', ctrlKey: true })
    fireEvent.paste(textField, { clipboardData })
    expect(textField).toHaveFocus()
    expect(uploadPlacePhoto).not.toHaveBeenCalled()

    rerender(<PlaceMapPopup placeId={PLACE_ID} canEdit={false} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })
    fireEvent.paste(window, { clipboardData })
    expect(uploadPlacePhoto).not.toHaveBeenCalled()
  })

  it('disables clipboard photo uploads for stored POIs opened in trip mode', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} allowPhotoPaste={false} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })

    expect(screen.queryByRole('textbox', { name: 'Collage d’image depuis le presse-papiers' })).not.toBeInTheDocument()
    expect(screen.queryByText('Collez une capture avec')).not.toBeInTheDocument()
    fireEvent.paste(window, { clipboardData: { files: [new File(['image'], 'capture.png', { type: 'image/png' })], items: [] } })
    expect(uploadPlacePhoto).not.toHaveBeenCalled()
  })

  it('reveals the history directly inside the quick card', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Manufacture' })
    fireEvent.click(screen.getByRole('button', { name: 'Afficher l’historique' }))
    expect(await screen.findByRole('heading', { name: 'Historique' })).toBeVisible()
    expect(screen.getByText('Aucun changement enregistré.')).toBeVisible()
  })

  it('uses the compact card hierarchy and shows the first image from the file endpoint', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: 'Manufacture' })).toBeVisible()
    expect(screen.getByText('Ancienne usine')).toBeVisible()
    expect(screen.getByText('Description')).toBeVisible()
    const coordinates = screen.getByRole('article', { name: 'Coordonnées GPS' })
    expect(within(coordinates).getByText('48.17000, 6.45000')).toBeVisible()
    expect(within(coordinates).getByRole('button', { name: 'Copier les coordonnées GPS' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Copier les coordonnées GPS' })).toHaveLength(1)
    expect(screen.getByText('Tags')).toBeVisible(); expect(screen.getByText('Non noté')).toBeVisible()
    expect(screen.getByText('Coordonnées')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'Région administrative' })).getByText('Non déterminée')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'Durée de visite' })).getByText('30 min')).toBeVisible()
    expect(screen.getByText('Danger')).toBeVisible()
    expect(screen.getByText('Ajouté le')).toBeVisible()
    expect(screen.getByText('Modifié le')).toBeVisible()
    expect(screen.getByText('2 févr. 2026')).toBeVisible()
    expect(screen.queryByText('Données importées')).not.toBeInTheDocument(); expect(screen.queryByText('technical-data')).not.toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'Façade' })
    expect(image).toHaveAttribute('src', expect.stringContaining(`/photos/${PHOTO.id}/file`))
    expect(image).not.toHaveAttribute('src', expect.stringContaining('must-not-be-used'))
    expect(getPlaceDetails).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal)); expect(getPlacePhotos).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal))
  })

  it('displays the resolved administrative region', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ ...PLACE, region: 'Grand Est' })
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    const region = await screen.findByRole('article', { name: 'Région administrative' })
    expect(within(region).getByText('Grand Est')).toBeVisible()
  })

  it('displays the configured POI visit duration', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ ...PLACE, default_visit_duration_minutes: 75 })
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    const duration = await screen.findByRole('article', { name: 'Durée de visite' })
    expect(within(duration).getByText('1 h 15')).toBeVisible()
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
    expect(screen.getByRole('region', { name: 'Note' })).toBeVisible()
  })

  it('adds the displayed POI to the selected trip day from the popup', async () => {
    const onAddToTrip = vi.fn().mockResolvedValue(undefined)
    render(<PlaceMapPopup placeId={PLACE_ID} tripAddTargetLabel="Ajouter au jour 2" onAddToTrip={onAddToTrip} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)

    await screen.findByRole('heading', { name: 'Manufacture' })
    const addButton = screen.getByRole('button', { name: 'Ajouter au jour 2' })
    expect(addButton).toHaveTextContent('Ajouter au jour 2')
    fireEvent.click(addButton)

    await waitFor(() => expect(onAddToTrip).toHaveBeenCalledWith(PLACE))
  })

  it('can hide place management actions without hiding navigation or trip actions', async () => {
    render(<PlaceMapPopup placeId={PLACE_ID} showManagementActions={false} tripAddTargetLabel="Ajouter au départ" onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)

    await screen.findByRole('heading', { name: 'Manufacture' })
    expect(screen.queryByRole('button', { name: 'Modifier le POI' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer le POI' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter au départ' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ouvrir dans Google Maps' })).toBeVisible()
  })

  it('shows only the rating that matches the status visit classification', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ ...PLACE, interest_rating: 3.5, visit_rating: 2 })
    const { rerender } = render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)
    const interestRating = await screen.findByLabelText('Envie avant visite : 3.5 sur 5')
    expect(interestRating).toBeVisible()
    expect(interestRating).toHaveStyle({ color: PLACE.status.color })
    expect(interestRating.querySelector('svg')).toHaveAttribute('width', '19')
    expect(screen.queryByLabelText(/Évaluation après visite/)).not.toBeInTheDocument()
    expect(screen.getByText('3.5')).toBeVisible()
    expect(interestRating.querySelector('[data-fill="50"]')).toBeInTheDocument()

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

  it('uses compact overlay arrows to browse several photos', async () => {
    vi.mocked(getPlacePhotos).mockResolvedValue([PHOTO, SECOND_PHOTO])
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByLabelText('Navigation des photos')).toHaveTextContent('1 / 2')
    const previous = screen.getByRole('button', { name: 'Photo précédente' })
    expect(previous).toBeEnabled()
    expect(previous).toHaveClass('trip-night-gallery__previous', 'popup-gallery-hover-action')
    expect(screen.getByRole('button', { name: 'Photo suivante' })).toHaveClass('trip-night-gallery__next', 'popup-gallery-hover-action')
    fireEvent.click(screen.getByRole('button', { name: 'Photo suivante' }))
    expect(await screen.findByRole('img', { name: 'Cour intérieure' })).toBeVisible()
    expect(screen.getByLabelText('Navigation des photos')).toHaveTextContent('2 / 2')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(await screen.findByRole('img', { name: 'Façade' })).toBeVisible()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(await screen.findByRole('img', { name: 'Cour intérieure' })).toBeVisible()
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

  it('keeps the four-line description area when the description is empty', async () => {
    vi.mocked(getPlaceDetails).mockResolvedValue({ ...PLACE, description: null })
    render(<PlaceMapPopup placeId={PLACE_ID} onEdit={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />)

    expect(await screen.findByText('Description')).toBeVisible()
    expect(screen.getByText('Description').closest('.popup-description')).toBeVisible()
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
