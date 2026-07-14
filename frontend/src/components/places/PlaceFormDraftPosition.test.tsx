import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EMPTY_PLACE_FORM_VALUES } from '../../forms/placeForm'
import { PlaceForm } from './PlaceForm'

describe('PlaceForm draft position', () => {
  it('has no secondary map and synchronizes valid coordinate input to the draft position', () => {
    const onDraftPositionChange = vi.fn()

    const { container } = render(
      <PlaceForm
        initialValues={{ ...EMPTY_PLACE_FORM_VALUES, latitude: '48', longitude: '2' }}
        maps={[]}
        categories={[]}
        tags={[]}
        allowMapChange={false}
        submitLabel="Créer"
        isSubmitting={false}
        draftPosition={{ latitude: 48, longitude: 2 }}
        onDraftPositionChange={onDraftPositionChange}
        onSubmit={vi.fn()}
      />,
    )

    expect(container.querySelector('.location-picker')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Latitude *'), { target: { value: '48.1234567' } })
    expect(onDraftPositionChange).toHaveBeenLastCalledWith({ latitude: 48.1234567, longitude: 2 })
    fireEvent.change(screen.getByLabelText('Longitude *'), { target: { value: '-2.7654321' } })
    expect(onDraftPositionChange).toHaveBeenLastCalledWith({ latitude: 48.1234567, longitude: -2.7654321 })
    fireEvent.change(screen.getByLabelText('Latitude *'), { target: { value: '99' } })
    expect(onDraftPositionChange).not.toHaveBeenLastCalledWith({ latitude: 99, longitude: -2.7654321 })
  })
})
