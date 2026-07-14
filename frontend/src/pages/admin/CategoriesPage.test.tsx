import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCategory, deleteCategory, getCategories, updateCategory } from '../../api/categories'
import { CategoriesPage } from './CategoriesPage'

vi.mock('../../api/categories', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

const CATEGORY = { id: '11111111-1111-4111-8111-111111111111', name: 'Industrie', description: 'Patrimoine industriel', icon: 'mdi:church' }

beforeEach(() => {
  vi.mocked(getCategories).mockResolvedValue([CATEGORY])
  vi.mocked(createCategory).mockResolvedValue(CATEGORY)
  vi.mocked(updateCategory).mockResolvedValue(CATEGORY)
  vi.mocked(deleteCategory).mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CategoriesPage', () => {
  it('loads and displays categories', async () => {
    render(<CategoriesPage />)
    expect(await screen.findByText('Industrie')).toBeVisible()
    expect(screen.getByText('Patrimoine industriel')).toBeVisible()
  })

  it('creates a category with a normalized description', async () => {
    render(<CategoriesPage />)
    await screen.findByText('Industrie')
    fireEvent.click(screen.getByRole('button', { name: 'Créer une catégorie' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom *' }), { target: { value: '  Château  ' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: '  Fortifié  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ name: 'Château', description: 'Fortifié' }))
  })

  it('updates only changed category fields', async () => {
    vi.mocked(updateCategory).mockResolvedValue({ ...CATEGORY, description: null })
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Industrie' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(CATEGORY.id, { description: null }))
  })

  it('sends the selected qualified icon during creation', async () => {
    render(<CategoriesPage />)
    await screen.findByText('Industrie')
    fireEvent.click(screen.getByRole('button', { name: 'Créer une catégorie' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom *' }), { target: { value: 'Église' } })
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    fireEvent.click(screen.getByRole('gridcell', { name: 'Église' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({ name: 'Église', description: null, icon: 'mdi:church' }))
  })

  it('does not send an icon patch when editing leaves it unchanged', async () => {
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Industrie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateCategory).not.toHaveBeenCalled())
  })

  it('sends a category icon patch only after choosing a different icon', async () => {
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Industrie' }))
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }))
    fireEvent.click(screen.getByRole('gridcell', { name: 'Château' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(CATEGORY.id, { icon: 'mdi:castle' }))
  })

  it('confirms and removes a category', async () => {
    render(<CategoriesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Industrie' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Supprimer « Industrie »')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith(CATEGORY.id))
    expect(screen.queryByText('Industrie')).not.toBeInTheDocument()
  })

  it('rejects an empty name without calling the API', async () => {
    render(<CategoriesPage />)
    await screen.findByText('Industrie')
    fireEvent.click(screen.getByRole('button', { name: 'Créer une catégorie' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nom *' }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Le nom est obligatoire.')).toBeVisible()
    expect(createCategory).not.toHaveBeenCalled()
  })
})
