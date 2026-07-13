import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_PLACE_FORM_VALUES } from '../../forms/placeForm'
import { PlaceForm } from './PlaceForm'
vi.mock('../map/LocationPicker', () => ({ LocationPicker: () => <div /> }))
const MAP = { id: 'map-id', name: 'France', country: { name: 'France' } } as never
describe('PlaceForm', () => { it('uses a map selector and has no free country input', () => { render(<PlaceForm initialValues={{ ...EMPTY_PLACE_FORM_VALUES, mapId: 'map-id' }} maps={[MAP]} allowMapChange categories={[]} tags={[]} submitLabel="Créer" isSubmitting={false} onSubmit={vi.fn()} />); expect(screen.getByRole('combobox', { name: 'Carte *' })).toHaveValue('map-id'); expect(screen.queryByRole('textbox', { name: 'Pays' })).not.toBeInTheDocument() }) })
