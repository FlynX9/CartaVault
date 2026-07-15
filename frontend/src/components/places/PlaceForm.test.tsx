import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_PLACE_FORM_VALUES } from '../../forms/placeForm'
import { PlaceForm } from './PlaceForm'

const MAP = { id: 'map-id', name: 'France', country: { name: 'France' } } as never

describe('PlaceForm', () => {
  afterEach(cleanup)
  it('uses a map selector and has no free country input', () => {
    render(<PlaceForm initialValues={{ ...EMPTY_PLACE_FORM_VALUES, mapId: 'map-id' }} maps={[MAP]} allowMapChange categories={[]} tags={[]} submitLabel="Créer" isSubmitting={false} onSubmit={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Carte *' })).toHaveValue('map-id')
    expect(screen.queryByRole('textbox', { name: 'Pays' })).not.toBeInTheDocument()
  })

  it('uses iconified category and searchable multi-tag menus', () => {
    render(<PlaceForm initialValues={{ ...EMPTY_PLACE_FORM_VALUES }} maps={[MAP]} allowMapChange categories={[{ id: 'category-id', name: 'Église', description: null, icon: 'mdi:church' }]} tags={[{ id: 'tag-id', name: 'Patrimoine' }]} submitLabel="Créer" isSubmitting={false} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getAllByText('Aucune catégorie')[0])
    fireEvent.click(screen.getByRole('option', { name: 'Église' }))
    fireEvent.click(screen.getByText('Ajouter des tags'))
    fireEvent.change(screen.getByPlaceholderText('Rechercher un tag'), { target: { value: 'Patrimoine' } })
    fireEvent.click(screen.getByRole('option', { name: 'Patrimoine' }))

    expect(screen.getByText('Église')).toBeVisible()
    expect(screen.getByText('1 tag sélectionné')).toBeVisible()
  })
})
