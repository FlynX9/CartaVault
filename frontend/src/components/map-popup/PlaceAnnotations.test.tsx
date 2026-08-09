import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deletePlaceAnnotation, getAnnotationTemplates, getPlaceAnnotations } from '../../api/annotations'
import type { AnnotationTemplate, PlaceAnnotation } from '../../types/annotation'
import { PlaceAnnotations } from './PlaceAnnotations'

vi.mock('../../api/annotations', () => ({
  deletePlaceAnnotation: vi.fn(),
  getAnnotationTemplates: vi.fn(),
  getPlaceAnnotations: vi.fn(),
}))

const MAP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLACE_ID = '11111111-1111-4111-8111-111111111111'
const TEMPLATE: AnnotationTemplate = {
  id: '22222222-2222-4222-8222-222222222222',
  map_id: MAP_ID,
  name: 'Parking',
  shape_type: 'rectangle',
  icon: 'tabler:map-pin',
  color: '#0f766e',
  sort_order: 0,
  is_active: true,
  usage_count: 1,
}
const ANNOTATION: PlaceAnnotation = {
  id: '33333333-3333-4333-8333-333333333333',
  place_id: PLACE_ID,
  template_id: TEMPLATE.id,
  geometry: { type: 'Polygon', coordinates: [[[2, 48], [2.1, 48], [2.1, 48.1], [2, 48]]] },
  radius_meters: null,
  title: 'Parking visiteurs',
  description: null,
  template: TEMPLATE,
}

beforeEach(() => {
  vi.mocked(getAnnotationTemplates).mockResolvedValue([TEMPLATE])
  vi.mocked(getPlaceAnnotations).mockResolvedValue([ANNOTATION])
  vi.mocked(deletePlaceAnnotation).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PlaceAnnotations', () => {
  it('loads and displays the annotation count as soon as the POI opens', async () => {
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)

    expect(getPlaceAnnotations).toHaveBeenCalledWith(PLACE_ID, expect.any(AbortSignal))
    const toggle = screen.getByRole('button', { name: /Plan \/ annotations/ })
    await waitFor(() => expect(toggle).toHaveTextContent('1'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows existing drawings and keeps the creation form collapsed by default', async () => {
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))

    expect(await screen.findByText('Parking visiteurs')).toBeVisible()
    const icon = document.querySelector('.popup-annotations__icon .category-icon-preview')
    expect(icon).toBeInTheDocument()
    expect(icon?.closest('.popup-annotations__icon')).toHaveStyle({ color: TEMPLATE.color })
    expect(screen.queryByLabelText('Type d’annotation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByLabelText('Type d’annotation')).toBeVisible()
    expect(screen.getByLabelText('Titre facultatif')).toBeVisible()
  })

  it('toggles one drawing on the map from its eye control', async () => {
    const listener = vi.fn()
    window.addEventListener('cartavault:annotation-visibility-changed', listener)
    render(<PlaceAnnotations placeId={PLACE_ID} mapId={MAP_ID} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: /Plan \/ annotations/ }))

    const hide = await screen.findByRole('button', { name: 'Masquer l’annotation Parking visiteurs' })
    fireEvent.click(hide)

    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ annotationId: ANNOTATION.id, visible: false })
    expect(screen.getByRole('button', { name: 'Afficher l’annotation Parking visiteurs' })).toBeVisible()
    window.removeEventListener('cartavault:annotation-visibility-changed', listener)
  })
})
