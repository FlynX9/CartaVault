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

  it('does not offer internal import status or category as editable choices', () => {
    render(<PlaceForm initialValues={{ ...EMPTY_PLACE_FORM_VALUES }} maps={[MAP]} allowMapChange categories={[{ id: 'import-category', name: 'Importé', description: null, icon: 'mdi:map-marker' }, { id: 'church', name: 'Église', description: null, icon: 'mdi:church' }]} tags={[]} statuses={[{ id: 'import-status', map_id: 'map-id', name: 'Importé', slug: 'importe', color: '#64707A', is_active: true, functional_state: 'non_visited' }, { id: 'todo', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' }]} submitLabel="Créer" isSubmitting={false} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByText('Choisir un statut'))
    expect(screen.queryByRole('option', { name: 'Importé' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'À faire' })).toBeVisible()
    fireEvent.click(screen.getByText('Aucune catégorie'))
    expect(screen.queryByRole('option', { name: 'Importé' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Église' })).toBeVisible()
  })

  it('honors the active map field configuration without clearing stored values', () => {
    const configuredMap = { id: 'map-id', name: 'France', country: { name: 'France' }, place_field_config: { description: false, ratings: true, favorite: true } }
    const statuses = [
      { id: 'todo', map_id: 'map-id', name: 'À faire', slug: 'a-faire', color: '#2563EB', is_active: true, functional_state: 'non_visited' as const },
      { id: 'done', map_id: 'map-id', name: 'Visité', slug: 'visite', color: '#0FA68A', is_active: true, functional_state: 'visited' as const },
    ]
    render(<PlaceForm initialValues={{ ...EMPTY_PLACE_FORM_VALUES, mapId: 'map-id', statusId: 'todo', description: 'Valeur conservée' }} maps={[configuredMap as never]} allowMapChange categories={[]} tags={[]} statuses={statuses} submitLabel="Créer" isSubmitting={false} onSubmit={vi.fn()} />)

    expect(screen.queryByRole('textbox', { name: 'Description' })).not.toBeInTheDocument()
    expect(screen.getByText('Favori')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Envie avant visite' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Évaluation après visite' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('À faire'))
    fireEvent.click(screen.getByRole('option', { name: 'Visité' }))

    expect(screen.queryByRole('combobox', { name: 'Envie avant visite' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Évaluation après visite' })).toBeVisible()
  })
})
