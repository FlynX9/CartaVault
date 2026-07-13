import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_PLACE_FORM_VALUES } from '../../forms/placeForm'
import { PlaceForm } from './PlaceForm'

vi.mock('../map/LocationPicker', () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}))

afterEach(cleanup)

describe('PlaceForm', () => {
  it('does not expose the removed address and owner fields', () => {
    render(
      <PlaceForm
        initialValues={EMPTY_PLACE_FORM_VALUES}
        categories={[]}
        tags={[]}
        submitLabel="Créer"
        isSubmitting={false}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Adresse')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Propriétaire')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'État et accès' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Chronologie' })).toBeVisible()
  })
})
