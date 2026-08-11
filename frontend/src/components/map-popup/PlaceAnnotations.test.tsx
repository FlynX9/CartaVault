import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deletePlaceAnnotation, getAnnotationTemplates, getPlaceAnnotations, updatePlaceAnnotation } from '../../api/annotations'
import type { AnnotationTemplate, PlaceAnnotation } from '../../types/annotation'
import { PlaceAnnotations } from './PlaceAnnotations'

vi.mock('../../api/annotations', () => ({ deletePlaceAnnotation: vi.fn(), getAnnotationTemplates: vi.fn(), getPlaceAnnotations: vi.fn(), updatePlaceAnnotation: vi.fn() }))

const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE: AnnotationTemplate = { id: '22222222-2222-4222-8222-222222222222', map_id: MAP_ID, name: 'Parking', shape_type: 'rectangle', icon: 'tabler:map-pin', color: '#0f766e', sort_order: 0, is_active: true, usage_count: 1 }
const ANNOTATION: PlaceAnnotation = { id: '33333333-3333-4333-8333-333333333333', place_id: PLACE_ID, template_id: TEMPLATE.id, geometry: { type: 'Polygon', coordinates: [[[2, 48], [2.1, 48], [2.1, 48.1], [2, 48]]] }, radius_meters: null, title: 'Parking visiteurs', description: null, template: TEMPLATE }

beforeEach(() => {
  vi.mocked(getAnnotationTemplates).mockResolvedValue([TEMPLATE])
  vi.mocked(getPlaceAnnotations).mockResolvedValue([ANNOTATION])
  vi.mocked(deletePlaceAnnotation).mockResolvedValue()
  vi.mocked(updatePlaceAnnotation).mockResolvedValue(ANNOTATION)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PlaceAnnotations', () => {
  it('loads and displays the annotation count as soon as the POI opens', async () => {
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    expect(getPlaceAnnotations).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal))
    const toggle = screen.getByRole('button', { name: /Plan \/ annotations/ })
    await waitFor(() => expect(toggle).toHaveTextContent('1'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('refreshes the annotation count after a drawing is saved for this POI', async () => {
    vi.mocked(getPlaceAnnotations).mockResolvedValueOnce([]).mockResolvedValueOnce([ANNOTATION])
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    await waitFor(() => expect(getPlaceAnnotations).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new CustomEvent('cartavault:annotations-updated', { detail: { placeId: PLACE_ID } }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Plan \/ annotations/ })).toHaveTextContent('1'))
  })

  it('shows existing drawings and keeps the creation form collapsed by default', async () => {
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))
    expect(await screen.findByText('Parking visiteurs')).toBeVisible()
    expect(screen.queryByLabelText('Type d’annotation')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter' }))
    expect(screen.getByLabelText('Type d’annotation')).toBeVisible()
    expect(screen.getByLabelText('Nom de l’annotation')).toBeVisible()
    expect(screen.getByLabelText('Commentaire de l’annotation')).toBeVisible()
  })

  it('passes the title and comment to the map drawing request', async () => {
    const listener = vi.fn()
    window.addEventListener('cartavault:annotation-draw-requested', listener)
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter' }))
    fireEvent.change(screen.getByLabelText('Nom de l’annotation'), { target: { value: 'Zone visiteurs' } })
    fireEvent.change(screen.getByLabelText('Commentaire de l’annotation'), { target: { value: 'Accès réservé.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dessiner sur la carte' }))
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ placeId: PLACE_ID, template: TEMPLATE, title: 'Zone visiteurs', description: 'Accès réservé.' })
    window.removeEventListener('cartavault:annotation-draw-requested', listener)
  })

  it('toggles one drawing on the map from its eye control', async () => {
    const listener = vi.fn()
    window.addEventListener('cartavault:annotation-visibility-changed', listener)
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Masquer l’annotation Parking visiteurs' }))
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ annotationId: ANNOTATION.id, visible: false })
    window.removeEventListener('cartavault:annotation-visibility-changed', listener)
  })

  it('toggles every drawing on the map from the section header', async () => {
    const listener = vi.fn()
    window.addEventListener('cartavault:place-annotations-visibility-changed', listener)
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    await screen.findByRole('button', { name: 'Masquer toutes les annotations' })
    fireEvent.click(screen.getByRole('button', { name: 'Masquer toutes les annotations' }))
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ placeId: PLACE_ID, annotationIds: [ANNOTATION.id], visible: false })
    window.removeEventListener('cartavault:place-annotations-visibility-changed', listener)
  })

  it('edits an annotation in the shared form without allowing its type to change', async () => {
    vi.mocked(updatePlaceAnnotation).mockResolvedValue({ ...ANNOTATION, title: 'Zone visiteurs', description: 'Accès réservé aux visiteurs.' })
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier l’annotation' }))
    expect(screen.getByLabelText('Type d’annotation')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nom de l’annotation'), { target: { value: 'Zone visiteurs' } })
    fireEvent.change(screen.getByLabelText('Commentaire de l’annotation'), { target: { value: 'Accès réservé aux visiteurs.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => expect(updatePlaceAnnotation).toHaveBeenCalledWith(PLACE_ID, ANNOTATION.id, { title: 'Zone visiteurs', description: 'Accès réservé aux visiteurs.' }))
    expect(screen.getByText('Zone visiteurs')).toBeVisible()
  })

  it('opens and selects an annotation when its drawing is clicked on the map', async () => {
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    window.dispatchEvent(new CustomEvent('cartavault:annotation-selected', { detail: { placeId: PLACE_ID, annotationId: ANNOTATION.id } }))
    expect(await screen.findByText('Parking visiteurs')).toBeVisible()
    expect(screen.getByText('Parking visiteurs').closest('li')).toHaveClass('is-selected')
  })

  it('selects and highlights the associated drawing from the annotation list', async () => {
    const selected = vi.fn()
    const hovered = vi.fn()
    window.addEventListener('cartavault:annotation-selected', selected)
    window.addEventListener('cartavault:annotation-hover-changed', hovered)
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))
    const row = (await screen.findByText('Parking visiteurs')).closest('li') as HTMLLIElement
    fireEvent.mouseEnter(row)
    expect((hovered.mock.calls[0][0] as CustomEvent).detail).toEqual({ placeId: PLACE_ID, annotationId: ANNOTATION.id })
    fireEvent.click(row)
    expect((selected.mock.calls[0][0] as CustomEvent).detail).toEqual({ placeId: PLACE_ID, annotationId: ANNOTATION.id })
    expect(row).toHaveClass('is-selected')
    fireEvent.mouseLeave(row)
    expect((hovered.mock.calls.at(-1)?.[0] as CustomEvent).detail).toEqual({ placeId: PLACE_ID, annotationId: null })
    window.removeEventListener('cartavault:annotation-selected', selected)
    window.removeEventListener('cartavault:annotation-hover-changed', hovered)
  })
})
